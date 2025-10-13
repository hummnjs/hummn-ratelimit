import { $ } from "bun";
import { build as Esbuild } from 'esbuild';

const build = async () => {
    await Promise.all([
      Bun.build({
        entrypoints: ['./src/bun/index.ts'],
        naming: "[dir]/bun.[ext]",
        outdir: './dist',
        minify: true,
        splitting: true,
        sourcemap: 'external',
        tsconfig: './tsconfig.json',
        format: 'esm',
        target: 'bun',

      }),
      Esbuild({
          entryPoints: ['src/node/index.ts'],
          outfile: 'dist/node.js',
          minify: true,
          bundle: true,
          target: 'esnext',
          format: 'esm',
          sourcemap: true,
          platform: 'node',
          external: ["redis", "@redis/client"],
      }),
      Esbuild({
          entryPoints: ['src/node/index.ts'],
          outfile: 'dist/node.cjs',
          minify: true,
          bundle: true,
          target: 'esnext',
          format: 'cjs',
          sourcemap: true,
          platform: 'node',
          external: ["redis", "@redis/client"],
      }),
       $`tsc`
    ])
};

build();
