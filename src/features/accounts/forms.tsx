/**
 * The account pages' forms: log in, sign up, forgot password, new password,
 * confirm address, confirm a new address, invitation. Each talks to the
 * server through ./client.ts, and has a file of its own in forms/ – a page
 * loads only its own (the pages import from there).
 */

export { ChangeEmailPanel } from "./forms/change-email";
export { InvitePanel } from "./forms/invite";
export { LoginForm } from "./forms/login";
export { ForgotForm, ResetForm } from "./forms/password";
export { RegisterForm } from "./forms/register";
export { VerifyPanel } from "./forms/verify";
