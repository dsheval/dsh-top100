// Preloaded only by the publication memory regression. Any network attempt fails
// the check, even if application fallback handling catches the thrown exception.
let attempts = 0;
globalThis.fetch = () => {
  attempts++;
  throw new Error('publication-memory-check-forbids-network');
};
process.on('exit', () => {
  console.log(`[publication-offline] ${JSON.stringify({ attempts })}`);
  if (attempts) process.exitCode = 1;
});
