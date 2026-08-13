import * as path from 'path';
import type { ICommandHooks } from 'aws-cdk-lib/aws-lambda-nodejs';

function forward(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Includes files served by Express that esbuild does not bundle itself. */
export function copyStaticAssetsHooks(): ICommandHooks {
  return {
    beforeBundling: () => [],
    beforeInstall: () => [],
    afterBundling(inputDir: string, outputDir: string): string[] {
      const script = [
        `require('fs').mkdirSync('${forward(path.join(outputDir, 'public'))}', { recursive: true })`,
        `require('fs').copyFileSync('${forward(path.join(inputDir, 'public', 'icon.png'))}', '${forward(path.join(outputDir, 'public', 'icon.png'))}')`,
      ].join(';');
      return [`node -e "${script}"`];
    },
  };
}
