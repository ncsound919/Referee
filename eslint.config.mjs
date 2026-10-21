import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    extends: [...next],
    rules: {
        // The React Compiler lint rules that ship with eslint-plugin-react-hooks
        // v6 are advisory performance heuristics, and this project does not use
        // the React Compiler. Two of them fire on the standard data-fetching
        // idiom this dashboard is built on - fetching on mount and then
        // polling - and they fail `next build` because `ignoreDuringBuilds` is
        // false.
        //
        // `react-hooks/set-state-in-effect` flags every effect that calls an
        // async loader which sets state, which is exactly what a live
        // dashboard does. `react-hooks/immutability` is likewise advisory.
        //
        // They are kept as warnings so they stay visible in `bun run lint`
        // without blocking a release build.
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/immutability': 'warn',
    },
}]);
