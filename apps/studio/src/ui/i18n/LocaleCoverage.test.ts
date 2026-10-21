import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { translations } from '@ui/i18n/translations';

/** A newly localized control must ship Hindi and Gujarati copy in the same change. */
it('covers every literal translation key used by the interface', () => {
  const missing = new Set<string>();
  const decode = (s: string) => s.replace(/&(?:amp|apos|quot|lt|gt);/g, match => ({ '&amp;': '&', '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>' })[match]!);
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function check(node: ts.Node) {
        let key: string | undefined;
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) key = node.arguments[0].text;
        if (ts.isJsxAttribute(node) && node.name.getText(source) === 'text' && node.initializer && ts.isStringLiteral(node.initializer) && node.parent.parent.tagName.getText(source) === 'UiText') key = decode(node.initializer.text);
        if (key?.trim() && !Object.hasOwn(translations, key.trim())) missing.add(key.trim());
        ts.forEachChild(node, check);
      }
      check(source);
    }
  }
  walk(resolve('src/ui')); walk(resolve('src/bootstrap'));
  expect([...missing]).toEqual([]);
});
