import type { ModuleEntry } from '@byteforce/shell';
import manifest from './manifest';
import activate from './activate';

const explorerModule: ModuleEntry = { manifest, activate };
export default explorerModule;
