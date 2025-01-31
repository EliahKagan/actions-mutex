import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import {promises as fs} from 'fs'
import * as path from 'path'
import * as utils from './utils'

const serverUrl = process.env['GITHUB_SERVER_URL'] || 'https://github.com'

export interface lockOptions {
  token?: string
  key: string
  repository: string
  prefix: string
}

export interface lockState {
  owner: string
  origin: string
  branch: string
}

class Locker {
  owner: string
  local: string
  branch: string
  origin: string
  key: string

  private constructor(owner: string, local: string, branch: string, origin: string, key: string) {
    this.owner = owner
    this.local = local
    this.branch = branch
    this.origin = origin
    this.key = key
  }

  static async create(options: lockOptions, state?: lockState): Promise<Locker> {
    const owner = state ? state.owner : await utils.random()
    const local = await utils.mkdtemp()
    const key = options.key
    const branch = state ? state.branch : options.prefix + options.key
    let origin = state ? state.origin : options.repository
    if (/^[^/]+\/[^/]+$/.test(origin)) {
      // it looks that GitHub repository
      origin = `${serverUrl}/${origin}`
    }
    return new Locker(owner, local, branch, origin, key)
  }

  async init(token?: string): Promise<void> {
    await this.git('init', this.local)
    await this.git('config', '--local', 'core.autocrlf', 'false')
    await this.git('remote', 'add', 'origin', this.origin)

    if (token) {
      // configure authorize header
      const auth = Buffer.from(`x-oauth-basic:${token}`).toString('base64')
      core.setSecret(auth) // make sure it's secret
      await this.git('config', '--local', `http.${serverUrl}/.extraheader`, `AUTHORIZATION: basic ${auth}`)
    }
  }

  async lock(token?: string): Promise<lockState> {
    await this.init(token)

    // generate files
    let data = `# Lock File for actions-mutex

The \`${this.branch}\` branch contains lock file for [actions-mutex](https://github.com/EliahKagan/actions-mutex).
DO NOT TOUCH this branch manually.

- Key: ${this.key}
`
    const currentRepository = process.env['GITHUB_REPOSITORY']
    const currentRunId = process.env['GITHUB_RUN_ID']
    if (currentRepository && currentRunId) {
      data += `- Workflow: [Workflow](${serverUrl}/${currentRepository}/actions/runs/${currentRunId})`
      data += '\n'
    }
    await fs.writeFile(path.join(this.local, 'README.md'), data)

    const state = {
      owner: this.owner,
      origin: this.origin,
      branch: this.branch
    }
    await fs.writeFile(path.join(this.local, 'state.json'), JSON.stringify(state))

    // configure user information
    await this.git('config', '--local', 'user.name', 'github-actions[bot]')
    await this.git('config', '--local', 'user.email', '1898282+github-actions[bot]@users.noreply.github.com')

    // commit
    await this.git('add', '.')
    await this.git('commit', '-m', 'add lock files')

    // try to lock
    let sleepSec: number = 1
    for (;;) {
      const locked = await this.tryLock()
      if (locked) {
        break
      }
      await utils.sleep(sleepSec + Math.random())

      // exponential back off
      sleepSec *= 2
      if (sleepSec > 30) {
        sleepSec = 30
      }
    }

    await this.cleanup()
    return state
  }

  async tryLock(): Promise<boolean> {
    let stderr: string = ''
    let code = await exec.exec('git', ['push', 'origin', `HEAD:${this.branch}`], {
      cwd: this.local,
      ignoreReturnCode: true,
      listeners: {
        stderr: data => {
          stderr += data.toString()
        }
      }
    })
    if (code == 0) {
      return true
    }
    if (stderr.includes('[rejected]') || stderr.includes('[remote rejected]')) {
      return false
    }
    throw new Error('failed to git push: ' + code)
  }

  async unlock(token?: string): Promise<void> {
    await this.init(token)
    await this.git('fetch', 'origin', this.branch)
    await this.git('checkout', `origin/${this.branch}`)
    const rawState = await fs.readFile(path.join(this.local, 'state.json'))
    const state = JSON.parse(rawState.toString()) as lockState
    if (state.owner !== this.owner) {
      // This lock is generated by another instance.
      // ignore it
      return
    }
    await this.git('push', '--delete', 'origin', this.branch)
    await this.cleanup()
  }

  async git(...args: string[]): Promise<void> {
    await exec.exec('git', args, {cwd: this.local})
  }

  async cleanup(): Promise<void> {
    io.rmRF(this.local)
  }
}

export async function lock(options: lockOptions): Promise<lockState> {
  const locker = await Locker.create(options)
  return locker.lock(options.token)
}

export async function unlock(options: lockOptions, state: lockState): Promise<void> {
  const locker = await Locker.create(options, state)
  return locker.unlock(options.token)
}
