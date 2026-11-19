const decisions = {
  pending: "wait",
  "dispatch-unknown": "stop",
  "invalid-result": "stop",
};

export function route({ state, nativeAllowed, nativeAvailable, exactSettings, isolatedScope, cliAllowed }) {
  if (Object.hasOwn(decisions, state)) return decisions[state];
  if (state !== "not-started") throw new Error("Unknown dispatch state");
  if (!exactSettings) return "stop";
  if (nativeAllowed && nativeAvailable && isolatedScope) return "native";
  return cliAllowed ? "cli" : "stop";
}

export function delivered(result, token) {
  return typeof token === "string" && /^[0-9a-f]{32}$/.test(token) &&
    typeof result === "string" && result.split(/\r?\n/, 1)[0] === `Task: ${token}`;
}

if (process.argv[1] && import.meta.main) {
  const [operation, input] = process.argv.slice(2);
  const value = JSON.parse(input);
  if (operation === "route") console.log(route(value));
  else if (operation === "delivered") console.log(delivered(value.result, value.token));
  else throw new Error("Expected route or delivered");
}
