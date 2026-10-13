/**
 * What a card's page leaves for the app on this device (card-panel.tsx →
 * features/app/gifts.tsx):
 *
 * - A card opened before logging in, to be taken once logged in – kept
 *   until then, like an invitation (accounts/forms.tsx): following “log in
 *   and take it” was the yes.
 * - A card just taken: the app greets its stamp once it opens.
 *
 * Plain storage, every read and write in try – without it, the card simply
 * waits on its page.
 */

/** A card to take after the login – its id. */
const LATER = "boop-card";
/** A card's stamp just taken – the app greets it (this tab only). */
const ARRIVED = "boop-card-arrived";

const read = (storage: () => Storage, key: string) => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};

const write = (storage: () => Storage, key: string, value: string | null) => {
  try {
    if (value) storage().setItem(key, value);
    else storage().removeItem(key);
  } catch {
    // No storage – nothing waits.
  }
};

const local = () => localStorage;
const session = () => sessionStorage;

export const cardToTake = {
  get: () => read(local, LATER),
  set: (id: string | null) => write(local, LATER, id),
};

export const cardArrived = {
  get: () => read(session, ARRIVED),
  set: (stamp: string | null) => write(session, ARRIVED, stamp),
};
