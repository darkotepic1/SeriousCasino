// Admin-Passwort im Terminal festlegen oder ändern:  npm run admin
// Funktioniert auch, während das Casino läuft.
const readline = require('readline');
const admin = require('./admin');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (s.includes('\n')) rl.output.write('\n'); else rl.output.write('*'); };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
    muted = true;
  });
}

(async () => {
  console.log('');
  console.log(admin.isSet() ? 'Admin-Passwort aendern' : 'Admin-Passwort festlegen');
  console.log('(mindestens 6 Zeichen, die Eingabe wird als * angezeigt)');
  const a = await askHidden('Neues Admin-Passwort: ');
  const b = await askHidden('Nochmal zur Bestaetigung: ');
  if (a !== b) {
    console.log('\nDie Passwoerter stimmen nicht ueberein. Nichts geaendert.');
    process.exit(1);
  }
  try {
    admin.setPassword(a);
    console.log('\nGespeichert! Im Casino unter Einstellungen -> Admin-Bereich anmelden.');
  } catch (e) {
    console.log(`\n${e.message} Nichts geaendert.`);
    process.exit(1);
  }
})();
