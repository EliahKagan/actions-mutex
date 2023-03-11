# About this fork of actions-mutex

This fork of the archived project
[shogo82148/actions-mutex](https://github.com/shogo82148/actions-mutex)
attempts to keep dependencies up to date. That project was written by [Ichinose
Shogo](https://github.com/shogo82148). The minor changes in this fork were done
by [Eliah Kagan](https://github.com/EliahKagan). This fork may have bugs, and
Ichinose Shogo is absolutely not to blame for them!

## Why this fork exists

That project was archived because GitHub added support for mutual exclusion,
which should usually be used instead of any third-party *action* providing
mutex functionality. Those considerations fully apply to this fork. The reason
this fork exists is one of the special cases where it still may be reasonable
to use a mutex action: when you want mutual exclusion with finer than job-level
granularity.

As detailed in [the original project's README, included below](#actions-mutex),
GitHub Actions now supports limiting concurrency at the workflow level and the
job level, but not at the *step* level. Step-level concurrency is not often
needed. You may be able to split a job into two jobs, so everything outside the
critical section is in one job and everything inside it is in another. Or you
may be able to use caching to speed up steps that don't need to be in the
critical section, so it doesn't matter if they are in it or not.

If you've considered those alternatives and still want step-level concurrency,
be aware of that this action only provides it partially. What really happens is
that it creates a critical section protecting all steps *after it* in a job.
That may just be a single step (the last step that does the important work that
every preceding steps merely prepares for). Then this is step-level
concurrency. Otherwise, it is somewhere between step-level and job-level
concurrency.

An alternative GitHub action you should consider is
[ben-z/gh-action-mutex](https://github.com/marketplace/actions/mutex-action).
As of this writing, that action uses a Docker container, so it would require
modification to work on macOS or Windows runners. Many workflows use only
`runs-on: ubuntu-latest`, which of course it supports. If that's all you need,
you prefer it; even in alpha, it is more mature and widely tested than this
fork.

## How to use this fork

All version 1 tags are from the upstream repository. If you use this action,
use a version 2 tag. For example, to always get the latest version 2 release:

```yaml
uses: EliahKagan/actions-mutex@v2
```

For example:

```yaml
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: EliahKagan/actions-mutex@v2
      - run: ': some jobs that can not run concurrently'
```

---

***The upstream project's original README is presented below.***


# actions-mutex

A GitHub Action for exclusive control.

## FEATURE

- avoid running multiple jobs concurrently across workflows

## OFFICIAL CONCURRENCY SUPPORT ON GITHUB ACTIONS

The action is no longer maintained.

On April 19, 2021, GitHub launched support for limiting concurrency in the workflow files.
Please consider to use this feature.

- [GitHub Actions: Limit workflow run or job concurrency](https://github.blog/changelog/2021-04-19-github-actions-limit-workflow-run-or-job-concurrency/)

Using this feature, the example in the SYNOPSIS section may be:

```yaml
on:
  push:
    branches:
      - main

# The workflow level concurrency
# https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions#concurrency
concurrency: deploy

jobs:
  build:

    # The job level concurrency
    # https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idconcurrency
    concurrency: deploy

    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: ': some jobs that can not run concurrently'
```

Please read the latest document of [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions).

## SYNOPSIS

```yaml
on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - uses: shogo82148/actions-mutex@v1
        with:
          key: deploy

      - run: ': some jobs that can not run concurrently'
```

## INPUTS

### key

The name of the critical section. The default is "lock".

### token

A GitHub Token. It must have a write access to the repository.
The default is "`${{ github.token }}`"

### repository

A repository for locking.
The default is the repository that the workflow runs on.

### prefix

Prefix of branch names for locking.
The default is "actions-mutex-lock/"

## HOW THE ACTION WORKS

As you known, Git rejects non-fast-forward updates.
The action uses it for locking.

The action tries to push a commit that contains a random string.
If the pushing succeeds, it means that no concurrent jobs run.

```
$ echo "$RANDOM" > lock.txt
$ git add lock.txt
$ git commit -m 'add lock files'
$ git push origin HEAD:actions-mutex-lock/lock
To https://github.com/shogo82148/actions-mutex
 * [new branch]      HEAD -> actions-mutex-lock/lock
```

If the pushing fails, it means that a concurrent job is now running.
The action will retry to push after some wait.

```
$ echo "$RANDOM" > lock.txt
$ git add lock.txt
$ git commit -m 'add lock files'
$ git push origin HEAD:actions-mutex-lock/lock
To https://github.com/shogo82148/actions-mutex
 ! [rejected]        HEAD -> actions-mutex-lock/lock (fetch first)
error: failed to push some refs to 'https://github.com/shogo82148/actions-mutex'
hint: Updates were rejected because the remote contains work that you do
hint: not have locally. This is usually caused by another repository pushing
hint: to the same ref. You may want to first integrate the remote changes
hint: (e.g., 'git pull ...') before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
```
