/**
 * File extension → Monaco language identifier mapping.
 */

const EXT_TO_LANGUAGE: Record<string, string> = {
    // Web
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    jsonc: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'xml',

    // Backend
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    lua: 'lua',
    r: 'r',
    dart: 'dart',
    scala: 'scala',
    groovy: 'groovy',

    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',

    // Data / Config
    toml: 'toml',
    ini: 'ini',
    env: 'plaintext',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    proto: 'proto',

    // Docs
    md: 'markdown',
    mdx: 'markdown',
    rst: 'restructuredtext',
    tex: 'latex',
    txt: 'plaintext',
    log: 'plaintext',

    // Other
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    gitignore: 'plaintext',
    gitattributes: 'plaintext',
};

/** Return Monaco language ID for a given file path. */
export function getLanguageFromPath(filePath: string): string {
    const name = filePath.split('/').pop() ?? '';
    const lower = name.toLowerCase();

    // Handle special filenames (no extension)
    if (lower === 'dockerfile') return 'dockerfile';
    if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile';
    if (lower === '.gitignore' || lower === '.gitattributes') return 'plaintext';
    if (lower === '.env' || lower.startsWith('.env.')) return 'plaintext';

    const ext = lower.split('.').pop();
    if (!ext) return 'plaintext';
    return EXT_TO_LANGUAGE[ext] ?? 'plaintext';
}
