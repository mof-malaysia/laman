/**
 * The sign-in running out mid-session (it expired, or an admin signed this
 * person out). The admin asks for it again in place (`SignInAgain`), so
 * nothing on screen is lost; work waiting on it watches this to carry on after.
 */
import { createStore } from "./store";

export const sessionLost = createStore(false);
