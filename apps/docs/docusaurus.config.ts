import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

const config: Config = {
  title: 'Sandbank n8n Docs',
  tagline: 'n8n + Obsidian Dokumentationssystem',
  url: 'https://localhost',
  baseUrl: '/docs/',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  favicon: 'img/logo.svg',

  i18n: {
    defaultLocale: 'de',
    locales: ['de'],
  },

  presets: [
    [
      'classic',
      {
        docs: false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'overview',
        path: 'docs/00-overview',
        routeBasePath: 'overview',
        sidebarPath: require.resolve('./sidebars.overview.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'architecture',
        path: 'docs/architecture',
        routeBasePath: 'architecture',
        sidebarPath: require.resolve('./sidebars.architecture.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'obsidian',
        path: 'docs/obsidian',
        routeBasePath: 'obsidian',
        sidebarPath: require.resolve('./sidebars.obsidian.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'contracts',
        path: 'docs/contracts',
        routeBasePath: 'contracts',
        sidebarPath: require.resolve('./sidebars.contracts.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'operations',
        path: 'docs/operations',
        routeBasePath: 'operations',
        sidebarPath: require.resolve('./sidebars.operations.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'adr',
        path: 'docs/adr',
        routeBasePath: 'adr',
        sidebarPath: require.resolve('./sidebars.adr.js'),
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'reference',
        path: 'docs/reference',
        routeBasePath: 'reference',
        sidebarPath: require.resolve('./sidebars.reference.js'),
        showLastUpdateTime: true,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'sandbank-n8n docs',
      logo: {
        alt: 'sandbank-n8n',
        src: 'img/logo.svg',
        href: '/overview/platform-overview',
      },
      items: [
        { to: '/overview/platform-overview', label: 'Overview', position: 'left' },
        { to: '/architecture/architecture-overview', label: 'Architecture', position: 'left' },
        { to: '/obsidian/obsidian-overview', label: 'Obsidian', position: 'left' },
        { to: '/contracts/contracts-overview', label: 'Contracts', position: 'left' },
        { to: '/operations/operations-overview', label: 'Operations', position: 'left' },
        { to: '/adr/adr-overview', label: 'ADR', position: 'left' },
        { to: '/reference/ssot/prompts-catalog', label: 'Reference', position: 'left' }
      ],
    },
  },
};

export default config;
