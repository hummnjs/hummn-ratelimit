

const build = async () => {
    await Promise.all([
      Bun.build({
        entrypoints: ['./src/bun/index.ts'],
        naming: "[dir]/bun.[ext]",
        outdir: './dist',
        minify: true,
        splitting: true,
        sourcemap: true,
        tsconfig: './tsconfig.json',
        format: 'esm',
        target: 'bun',
        packages: 'external'
      }),
      Bun.build({
        entrypoints: ['./src/node/index.ts'],
        naming: "[dir]/node.[ext]",
        outdir: './dist',
        minify: true,
        splitting: true,
        sourcemap: true,
        tsconfig: './tsconfig.json',
        format: 'esm',
        target: 'node',
        packages: 'external'
      })
    ])
};

build();
