/* Shared clock for every test runner: a time of day plus the seconds since the run began, and a slowest-first table.

   const { startClock, formatTable } = require('./timing');
   const clock = startClock();
   clock.stamp()                       → "14:03:27 +85s"
   formatTable('Time per audit', rows) → rows are { name, seconds, startedAt, endedAt, ok }  */
function startClock() {
  const began = Date.now();
  const timeOfDay = (ms) => new Date(ms).toTimeString().slice(0, 8);
  return {
    began,
    now: () => Date.now(),
    stamp: () => timeOfDay(Date.now()) + ' +' + ((Date.now() - began) / 1000).toFixed(0) + 's',
    startedAtText: () => timeOfDay(began),
    elapsedSeconds: () => (Date.now() - began) / 1000,
  };
}

function formatTable(title, rows) {
  const lines = ['', `${title}, slowest first (clock time +seconds since the run began):`];
  for (const row of [...rows].sort((first, second) => second.seconds - first.seconds)) {
    lines.push(`  ${row.seconds.toFixed(1).padStart(6)}s  ${(row.ok === false ? 'FAIL ' : '') + row.name.padEnd(row.ok === false ? 26 : 31)} ${row.startedAt}  to  ${row.endedAt}`);
  }
  return lines.join('\n');
}

module.exports = { startClock, formatTable };
