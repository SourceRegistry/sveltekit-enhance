import {defineConfig} from 'vitest/config';
import {sveltekit} from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-auto';
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [sveltekit({adapter: adapter(), preprocess: vitePreprocess()})],
    server: {
        hmr: {
            port: 5174
        }
    },
    build: {
        rollupOptions: {
            external: ['node:*']
        },
    },
    test: {
        expect: {requireAssertions: true},
        projects: [
            {
                extends: './vite.config.ts',
                test: {
                    name: 'lib',
                    include: ['src/**/*.{test,spec}.{js,ts}', 'src/**/*.svelte.{test,spec}.{js,ts}'],
                }
            },
        ]
    }
});
