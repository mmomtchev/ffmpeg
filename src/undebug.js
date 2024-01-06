const ts = require('typescript');

// This TypeScript transforms removes all `verbose()` statements from the final build
module.exports = (ctx) => {
  return (sourceFile) => {
    function visit(node) {
      if (!process.env.TSC_DEBUG) {
        if (ts.isCallExpression(node) && node.expression.escapedText === 'verbose') {
          return ts.factory.createTrue();
        }
      }
      return ts.visitEachChild(node, visit, ctx);
    }
    return ts.visitNode(sourceFile, visit);
  };
};
