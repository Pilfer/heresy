import { readFileSync, existsSync } from 'fs';

import { HeresyConfig } from "src/hermes_agent/heresy";

export interface HeresyAppConfig  {
  package_name: string;
  hermes_before?: string;
  hermes_hook: string;
  rpc_port: number;
  heresy_config: HeresyConfig;
}

export const loadConfig = () : HeresyAppConfig => {
  if (!existsSync('.heresy/heresy.json')) {
    console.error('.heresy/heresy.json does not exist');
    process.exit(1);
  }

  let conf = readFileSync('.heresy/heresy.json', 'utf8');
  
  return JSON.parse(conf);
};

// Reads all the scripts from the appropriate folders and injects the Heresy config into the frida agent
export const readScripts = (conf: HeresyAppConfig) : { frida_agent: string, heresy_core: string, hermes_before?: string, hermes_hook: string } => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const fridaAgentPath = resolveModulePath(`${packageJson.name}/dist/_frida_agent.js`, 'dist/_frida_agent.js');
  const heresyCorePath = resolveModulePath(`${packageJson.name}/dist/_hermes_agent.js`, 'dist/_hermes_agent.js');
  return {
    frida_agent: readFileSync(fridaAgentPath, 'utf8'),
    heresy_core: readFileSync(heresyCorePath, 'utf8').replace(`"REPLACED_VIA_CODE"`, `'${JSON.stringify(conf.heresy_config)}'`),
    hermes_before: conf.hermes_before ? readFileSync(conf.hermes_before, 'utf8') : undefined,
    hermes_hook: readFileSync(conf.hermes_hook, 'utf8'),
  }
};

const resolveModulePath = (modulePath: string, fallbackPath: string): string => {
  try {
    return require.resolve(modulePath);
  } catch (e) {
    return fallbackPath;
  }
};