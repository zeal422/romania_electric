import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // Gardă mecanică pentru contractul de timp fake-UTC (AGENTS.md §4.7): wall-clock
  // România etichetat UTC, afișat fidel prin getters UTC. Getterii locali și
  // constructorii locali produc valori dependente de fusul mașinii — bug-urile
  // reale din 0.2.2 (getters locale) și 0.3.27 (off-by-one calendar).
  files: ["src/lib/sen/**/*.ts"],
  ignores: ["src/lib/sen/calendar.ts"], // excepția intenționată: input calendar în fusul LOCAL al browserului
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "CallExpression[callee.property.name=/^(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getMilliseconds|getTimezoneOffset)$/]",
        message:
          "Getter local interzis în stratul fake-UTC — folosește variantele UTC (getUTCHours etc.). Contract de timp: AGENTS.md §4.7.",
      },
      {
        selector:
          "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/][arguments.length<2]",
        message:
          'toLocale* fără opțiuni e interzis în stratul fake-UTC — trece mereu { timeZone: "UTC" } (pattern existent în format.ts). Contract de timp: AGENTS.md §4.7.',
      },
      {
        selector: "NewExpression[callee.name='Date'][arguments.length>=2]",
        message:
          "Constructorul local new Date(y,m,d,...) e interzis în stratul fake-UTC — folosește Date.UTC(...). Contract de timp: AGENTS.md §4.7.",
      },
    ],
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "data", "scripts/**", "tests/**"],
}, prettierConfig];

export default eslintConfig;
