import type { ActionState } from "./action-state";

/** A server action used as a <form action> through useActionState (usually bound to its ids first). */
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
