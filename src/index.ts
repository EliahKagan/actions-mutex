import * as core from '@actions/core'
import * as lock from './lock'

async function run() {
  const required = {
    required: true
  }
  const token = core.getInput('token', required)
  const key = core.getInput('key', required)
  const repository = core.getInput('repository', required)
  const prefix = core.getInput('prefix', required)

  const state = await lock.lock({
    token,
    key,
    repository,
    prefix
  })
  core.saveState('STATE', JSON.stringify(state))
}

run()
