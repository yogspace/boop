.PHONY: up-db down-db deploy

# The local MongoDB for `pnpm dev` (docker-compose.dev.yml, port 27019) –
# start it before working, stop it when done. The data stays in its volume.
up-db:
	docker compose -f docker-compose.dev.yml up -d

down-db:
	docker compose -f docker-compose.dev.yml down

# Merges development → main (which deploys) and returns to development.
#   1. The working tree must be clean.
#   2. Push development.
#   3. Check out main, pull, merge development, push.
#   4. Always back to development – even if the merge fails.
deploy:
	@set -e; \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "✗ Working-Tree ist nicht sauber. Bitte erst committen/stashen."; \
		git status --short; \
		exit 1; \
	fi; \
	START_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$START_BRANCH" != "development" ]; then \
		echo "✗ Nicht auf development (aktuell: $$START_BRANCH). Abbruch."; \
		exit 1; \
	fi; \
	echo "→ push development"; \
	git push origin development; \
	echo "→ checkout main + pull"; \
	if git show-ref --verify --quiet refs/heads/main; then \
		git checkout main; \
	elif git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then \
		git checkout -b main --track origin/main; \
	else \
		echo "→ main gibt es noch nicht – wird aus development angelegt"; \
		git checkout -b main; \
	fi; \
	if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then \
		git pull --ff-only origin main; \
	fi; \
	echo "→ merge development → main"; \
	if git merge --no-edit development; then \
		echo "→ push main"; \
		git push -u origin main; \
		echo "✓ development nach main gemerged und gepusht."; \
	else \
		echo "✗ Merge-Konflikt. Bitte manuell lösen; kehre zu development zurück."; \
		git merge --abort || true; \
		git checkout development; \
		exit 1; \
	fi; \
	echo "→ zurück zu development"; \
	git checkout development
