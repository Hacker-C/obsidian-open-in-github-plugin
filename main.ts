import { Notice, Plugin,  addIcon } from 'obsidian'
import * as path from 'path'
import * as fs from 'fs'

const customIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
<path d="M9 18c-4.51 2-5-2-7-2"/>
<g transform="translate(12 12) scale(0.5)" stroke="currentColor">
  <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>
  <path d="m21 3-9 9"/>
  <path d="M15 3h6v6"/>
</g>
</svg>
`

const CONSTS = {
  TITLE_ID: 'open-in-github',
  TITLE: 'Open in GitHub'
}

interface OpenInGitHubPluginSettings {
  mySetting: string
}

const DEFAULT_SETTINGS: OpenInGitHubPluginSettings = {
  mySetting: 'default'
}

export default class OpenInGitHubPlugin extends Plugin {
  settings: OpenInGitHubPluginSettings

  async onload() {
    await this.loadSettings()

    // add icon
    addIcon(CONSTS.TITLE_ID, customIcon)

    // left open-in-github button
    this.addRibbonIcon(CONSTS.TITLE_ID, CONSTS.TITLE, this.openGitHub)

    // add file menu
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle(CONSTS.TITLE)
            .setIcon(CONSTS.TITLE_ID)
            .onClick((e) => this.openGitHub(e as MouseEvent, true));
        });
      })
    );

    // add editormenu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle(CONSTS.TITLE)
            .setIcon(CONSTS.TITLE_ID)
            .onClick((e) => this.openGitHub(e as MouseEvent, true));
        });
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  /**
   * open github in browser
   * @param evt 
   * @param openFile 
   */
  openGitHub = async (evt: MouseEvent, openFile?: boolean) => {
    try {
      const repoUrl = await this.getGitHubRepoUrl()
      if (repoUrl) {
        const fileRelativePath = this.app.workspace.getActiveFile()
        if (openFile) {
          if (fileRelativePath?.path) {
            let branch = await this.getCurrentBranch(fileRelativePath?.path)
            if (!branch) {
              branch = 'main'
            }
            const fileUrl = `${repoUrl}/blob/${branch}/${fileRelativePath?.path}`
            window.open(fileUrl, '_blank')
          } else {
            new Notice('Not found file relative path!')
          }
        } else {
          window.open(repoUrl, '_blank')
        }
      } else {
        new Notice('Could not determine GitHub repository URL.')
      }
    } catch (err) {
      new Notice('Failed to open GitHub repository.')
      console.error(err)
    }
  }

  /**
   * Get the GitHub repository URL for the current vault.
   */
  async getGitHubRepoUrl(): Promise<string | null> {
    const vaultPath = this.getVaultBasePath()
    if (!vaultPath) {
      new Notice('This feature is only supported in the desktop app.')
      return null
    }

    const gitDir = path.join(vaultPath, '.git')
    if (!fs.existsSync(gitDir)) {
      new Notice('No .git directory found in the vault.')
      return null
    }

    const configPath = path.join(gitDir, 'config')
    if (!fs.existsSync(configPath)) {
      new Notice('No .git/config file found.')
      return null
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const remoteMatch = configContent.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.*)/)
    if (!remoteMatch) {
      new Notice('No remote "origin" found in .git/config.')
      return null
    }

    const remoteUrl = remoteMatch[1].trim()
    return this.convertToGitHubUrl(remoteUrl)
  }

  /**
   * Convert a Git remote URL to a GitHub URL.
   */
  convertToGitHubUrl(remoteUrl: string): string | null {
    // Handle HTTPS URLs (e.g., https://github.com/user/repo.git)
    if (remoteUrl.startsWith('https://')) {
      return remoteUrl.replace(/\.git$/, '')
    }

    // Handle SSH URLs (e.g., git@github.com:user/repo.git)
    if (remoteUrl.startsWith('git@')) {
      return remoteUrl.replace(':', '/').replace('git@', 'https://').replace(/\.git$/, '')
    }

    return null
  }

  /**
   * Get the base path of the vault (only works in desktop app).
   */
  getVaultBasePath(): string | null {
    // @ts-ignore
    if (this.app.vault.adapter?.getBasePath) {
      // @ts-ignore
      return this.app.vault.adapter.getBasePath()
    }
    return null
  }

  /**
   * Get the current branch of the Git repository.
   */
  async getCurrentBranch(filePath: string): Promise<string | null> {
    const vaultPath = this.getVaultBasePath()
    if (!vaultPath) {
      new Notice('This feature is only supported in the desktop app.')
      return null
    }

    const gitDir = path.join(vaultPath, '.git')
    if (!fs.existsSync(gitDir)) {
      new Notice('No .git directory found in the vault.')
      return null
    }

    const headPath = path.join(gitDir, 'HEAD');
    const headContent = fs.readFileSync(headPath, 'utf-8').trim();

    // Example: ref: refs/heads/main
    const branchMatch = headContent.match(/ref: refs\/heads\/(.*)/);
    if (branchMatch) {
      return branchMatch[1];
    }

    return null;
  }
}
