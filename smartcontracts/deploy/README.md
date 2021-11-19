deploy
======



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/deploy.svg)](https://npmjs.org/package/deploy)
[![Downloads/week](https://img.shields.io/npm/dw/deploy.svg)](https://npmjs.org/package/deploy)
[![License](https://img.shields.io/npm/l/deploy.svg)](https://github.com/mongelly/deploy/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g deploy
$ deploy COMMAND
running command...
$ deploy (-v|--version|version)
deploy/0.1.0 darwin-x64 node-v12.22.1
$ deploy --help [COMMAND]
USAGE
  $ deploy COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`deploy hello [FILE]`](#deploy-hello-file)
* [`deploy help [COMMAND]`](#deploy-help-command)

## `deploy hello [FILE]`

describe the command here

```
USAGE
  $ deploy hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ deploy hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/mongelly/deploy/blob/v0.1.0/src/commands/hello.ts)_

## `deploy help [COMMAND]`

display help for deploy

```
USAGE
  $ deploy help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.2/src/commands/help.ts)_
<!-- commandsstop -->
