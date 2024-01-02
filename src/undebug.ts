import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';

// This TypeScript transforms removes all `verbose()` statements from the final build
export default function (program: ts.Program, pluginConfig: PluginConfig, { ts: tsInstance }: TransformerExtras) {
  return (ctx: ts.TransformationContext) => {
    const { factory } = ctx;

    return (sourceFile: ts.SourceFile) => {
      function visit(node: ts.Node): ts.Node {
        if (!process.env.TSC_DEBUG) {
          if (tsInstance.isCallExpression(node) && node.expression.getText(sourceFile) === 'verbose') {
            return factory.createTrue();
          }
        }
        return tsInstance.visitEachChild(node, visit, ctx);
      }
      return tsInstance.visitNode(sourceFile, visit);
    };
  };
}
