// This destination is sent only after the server has calculated the earned level.
// The 32 current signs lead from level 1 to level 33, without a completion bonus.
export function gameContinuation(level) {
  if (!Number.isInteger(level) || level < 33) return null;
  return {
    level: 33,
    message: 'Bien joué. La suite t’attend.',
    label: 'Rejoindre le Discord',
    href: 'https://discord.gg/y83ewhS49',
  };
}
