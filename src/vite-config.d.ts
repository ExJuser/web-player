declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
  };

  export default path;
}

declare const __dirname: string;

declare const process: {
  cwd(): string;
};
