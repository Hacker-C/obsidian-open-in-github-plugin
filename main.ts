import { Notice, Plugin, addIcon, TFile, Vault } from 'obsidian'

// open github icon
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

// Define constants for git paths relative to vault root
const GIT_DIR = '.git'
const GIT_CONFIG_PATH = `${GIT_DIR}/config`
const GIT_HEAD_PATH = `${GIT_DIR}/HEAD`

export default class OpenInGitHubPlugin extends Plugin {
  vaultAdapter: Vault['adapter']

  async onload() {
    // Use vault adapter
    this.vaultAdapter = this.app.vault.adapter

    // Check if adapter exists (basic check for environment support)
    if (!this.vaultAdapter) {
      console.error("OpenInGitHubPlugin: Vault adapter is not available. Plugin may not work correctly.")
      new Notice("OpenInGitHubPlugin: Vault adapter not found. Some features might be limited.")
    }

    // add icon
    addIcon(CONSTS.TITLE_ID, customIcon)

    // left open-in-github button
    this.addRibbonIcon(CONSTS.TITLE_ID, CONSTS.TITLE, (evt) => this.openGitHub(evt)) // Pass event directly

    // add file menu
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        // Only add if the file is potentially in a git repo
        if (file instanceof TFile) {
          menu.addItem((item) => {
            item
              .setTitle(CONSTS.TITLE)
              .setIcon(CONSTS.TITLE_ID)
              .onClick((e) => this.openGitHub(e as MouseEvent, file)) // Pass file context
          })
        }
      })
    )

    // add editor menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        // Only add if the file is potentially in a git repo
        if (view?.file) {
          menu.addItem((item) => {
            item
              .setTitle(CONSTS.TITLE)
              .setIcon(CONSTS.TITLE_ID)
              .onClick((e) => this.openGitHub(e as MouseEvent, view.file as TFile)) // Pass file context
          })
        }
      })
    )
  }

  /**
   * open github in browser
   * @param evt The mouse event that triggered the action
   * @param file The file context (optional), if triggered from file/editor menu
   */
  openGitHub = async (evt: MouseEvent, file?: TFile) => {
    try {
      // Determine the file path to use
      const targetFile = file // this.app.workspace.getActiveFile()
      const openFileInRepo = !!targetFile // True if we have a file context

      const repoUrl = await this.getGitHubRepoUrl()
      if (!repoUrl) {
        // Notice is shown within getGitHubRepoUrl if needed
        return
      }

      if (openFileInRepo && targetFile) {
        // Use targetFile.path which is relative to the vault root
        const filePathRelative = targetFile.path
        let branch = await this.getCurrentBranch()
        if (!branch) {
          // Default to 'main' if branch detection fails
          branch = 'main'
          new Notice("Could not detect current branch, defaulting to 'main'.")
        }
        const fileUrl = `${repoUrl}/blob/${branch}/${filePathRelative}`
        window.open(fileUrl, '_blank')

      } else if (!openFileInRepo) {
        // If no file context (e.g., ribbon click), open the repo root
        window.open(repoUrl, '_blank')
      } else {
        // Case where we intended to open a file, but targetFile is null/undefined
        new Notice('No active file selected to open in GitHub.')
      }

    } catch (err) {
      new Notice('Failed to open GitHub repository.')
      console.error("OpenInGitHubPlugin Error:", err)
    }
  }

  /**
   * Get the GitHub repository URL for the current vault using Vault adapter.
   */
  async getGitHubRepoUrl(): Promise<string | null> {
    if (!this.vaultAdapter) {
      new Notice('Vault adapter not available. Cannot access file system.')
      return null
    }

    try {
      // Check if .git directory exists at the vault root
      const gitDirExists = await this.vaultAdapter.exists(GIT_DIR)
      if (!gitDirExists) {
        new Notice('No .git directory found in the vault root.')
        return null
      }

      // Check if .git/config file exists
      const configPathExists = await this.vaultAdapter.exists(GIT_CONFIG_PATH)
      if (!configPathExists) {
        new Notice('No .git/config file found.')
        return null
      }

      // Read the config file content
      const configContent = await this.vaultAdapter.read(GIT_CONFIG_PATH)

      // Find the remote "origin" URL
      const remoteMatch = configContent.match(/\[remote\s+"origin"\][^[]*?\n\s*url\s*=\s*(.*)/)
      if (!remoteMatch || !remoteMatch[1]) {
        new Notice('No remote "origin" URL found in .git/config.')
        return null
      }

      const remoteUrl = remoteMatch[1].trim()
      const githubUrl = this.convertToGitHubUrl(remoteUrl)

      if (!githubUrl) {
        new Notice('Could not parse GitHub URL from remote "origin".')
        return null
      }

      return githubUrl

    } catch (error) {
      console.error("OpenInGitHubPlugin: Error accessing git config:", error)
      new Notice("Error accessing git configuration.")
      return null
    }
  }

  /**
   * Convert a Git remote URL to a GitHub web URL.
   */
  convertToGitHubUrl(remoteUrl: string): string | null {
    // Handle HTTPS URLs (e.g., https://github.com/user/repo.git)
    let match = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)
    if (match) {
      return `https://github.com/${match[1]}`
    }

    // Handle SSH URLs (e.g., git@github.com:user/repo.git)
    match = remoteUrl.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/)
    if (match) {
      return `https://github.com/${match[1]}`
    }

    return null // Return null if format is not recognized
  }

  /**
   * Get the current branch of the Git repository using Vault adapter.
   */
  async getCurrentBranch(): Promise<string | null> {
    if (!this.vaultAdapter) {
      new Notice('Vault adapter not available. Cannot access file system.')
      return null
    }

    try {
      // Check if .git directory exists
      const gitDirExists = await this.vaultAdapter.exists(GIT_DIR)
      if (!gitDirExists) {
        // No notice here, as getGitHubRepoUrl would likely fail first
        return null
      }

      // Check if .git/HEAD file exists
      const headPathExists = await this.vaultAdapter.exists(GIT_HEAD_PATH)
      if (!headPathExists) {
        new Notice('No .git/HEAD file found. Cannot determine branch.')
        return null
      }

      // Read the HEAD file content
      const headContent = (await this.vaultAdapter.read(GIT_HEAD_PATH)).trim()

      // Example HEAD content: "ref: refs/heads/main" or "ref: refs/heads/feature/branch"
      const branchMatch = headContent.match(/^ref:\s+refs\/heads\/(.*)/)
      if (branchMatch && branchMatch[1]) {
        return branchMatch[1] // Return the branch name
      }

      new Notice('Could not parse branch name from .git/HEAD.')
      return null
    } catch (error) {
      console.error("OpenInGitHubPlugin: Error reading git HEAD:", error)
      new Notice("Error reading git branch information.")
      return null
    }
  }
}