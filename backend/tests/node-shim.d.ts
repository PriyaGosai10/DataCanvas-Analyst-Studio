declare module "crypto" { export function createHash(algorithm: string): { update(value: string): { digest(encoding: string): string } }; }
