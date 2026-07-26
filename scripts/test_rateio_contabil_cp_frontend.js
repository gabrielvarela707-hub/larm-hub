const assert = require("assert");
const fs = require("fs");
const path = require("path");
let ts;
try {
  ts = require("typescript");
} catch {
  ts = require("/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript");
}

const file = path.join(
  __dirname,
  "../src/app/(dashboard)/financeiro/pagar/page.tsx",
);
const source = fs.readFileSync(file, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
  fileName: file,
});
const errors = (transpiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (errors.length) {
  for (const diagnostic of errors) {
    console.error(
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
  }
}
assert.strictEqual(errors.length, 0, "O TSX do rateio contábil contém erro de sintaxe.");

assert.match(source, /Rateio contábil/i);
assert.match(source, /Dividir entre vários planos de contas/i);
assert.match(source, /plano_contas_id/);
assert.match(source, /centro_custo/);
assert.match(source, /histórico complementar/i);
assert.doesNotMatch(source, /Rateio por contas bancárias/i);
assert.doesNotMatch(source, /Dividir entre várias contas(?! de)/i);
assert.doesNotMatch(source, /item\.banco_conta_id/);
assert.doesNotMatch(source, /item\.empresa/);

console.log("✅ TSX e interface do rateio contábil validados.");
