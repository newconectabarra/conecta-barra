/** Guarda em memória o token de push deste aparelho para poder removê-lo do servidor ao sair da conta. */
let currentPushToken: string | null = null;
export function setCurrentPushToken(token: string | null) { currentPushToken = token; }
export function getCurrentPushToken() { return currentPushToken; }
