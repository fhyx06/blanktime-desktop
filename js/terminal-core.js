(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./filesystem-core.js'));
  else root.blanktimeTerminalCore = factory(root.blanktimeFilesystemCore);
})(typeof window !== 'undefined' ? window : this, function(filesystemCore) {
  'use strict';
  const COMMANDS = ['help', 'pwd', 'ls', 'll', 'cd', 'open', 'search', 'clear', 'exit', 'su', 'rm'];
  const MAX_INPUT = 4096;
  const MAX_LINES = 1000;
  const DEFAULT_FONT_SIZE = 14.5;
  const cleanText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  const KINDS = ['text', 'muted', 'directory', 'error', 'success', 'welcome', 'warning', 'info'];
  const DEFAULT_COLORS = {
    text:'#d6e1ed', muted:'#97a8ba', directory:'#83bcf3', error:'#ffabb0',
    success:'#86d6af', welcome:'#f0f5fa', warning:'#f2c97d', info:'#83bcf3',
    prompt:'#86d6af', root_prompt:'#f2c97d', background:'#151c24', input:'#f0f5fa', caret:'#b1e5c8',
    prompt_separator:'#5f7189', prompt_symbol:'#b8c7d8', list_meta:'#5f7189', list_owner:'#7e90a5',
    image:'#f3a8c8', document:'#e9d6a8', background_glow:'#1d2a38',
    banner_start:'#86d6af', banner_middle:'#83bcf3', banner_end:'#f3a8c8'
  };
  const COMMAND_DETAILS = {
    help:['{command} [name]', '显示命令帮助'], pwd:['{command}', '显示当前目录'],
    ls:['{command} [-lah] [路径]', '列出目录；-l 详细信息，-a 隐藏项，-h 易读大小'],
    ll:['{command} [路径]', '等同于 {ls} -l（也可搭配 -a、-h）'],
    cd:['{command} [路径]', '切换目录；无参数返回 ~'],
    open:['{command} 路径', '打开文章、图片、音乐、应用或目录'],
    search:['{command} 关键词', '搜索文章、相册图片与音乐'],
    clear:['{command}', '清空终端输出'], exit:['{command}', '退出当前 shell'],
    su:['{command} [-] [root]', 'Switch user; - starts a login shell.'],
    rm:['{command} [-rf] PATH...', 'Remove files or directories.']
  };
  const DEFAULT_MESSAGES = {
    help_intro:["These shell commands are defined internally.  Type `{help}' to see this list.Type `{help}' to see this list.\nType `{help} name' to find out more about the function `name'.", 'muted'],
    help_not_found:["{shell}: {command}: no help topics match `{target}'.", 'error'],
    no_such_path:['{shell}: {command}: {path}: No such file or directory', 'error'],
    not_directory:['{shell}: {command}: {path}: Not a directory', 'error'],
    unknown_command:['{command}: command not found', 'error'],
    invalid_arguments:['{command}: invalid number of arguments\nusage: {usage}', 'error'],
    invalid_option:['{command}: invalid option: {option}', 'error'],
    too_many_paths:['{command}: too many operands', 'error'],
    unclosed_quote:['{shell}: syntax error: unterminated quote', 'error'],
    incomplete_escape:['{shell}: syntax error: incomplete escape sequence', 'error'],
    input_too_long:['{shell}: command line too long (max {limit} characters)', 'error'],
    search_usage:['usage: {usage}', 'error'],
    search_empty:['No matches found.', 'muted'],
    opening:['Opening {name}...', 'muted'],
    too_many_results:['Output truncated (limit: {limit} lines).', 'muted'],
    total:['total {total}', 'text'],
    last_login:['Last login: {date}', 'muted'],
    last_login_ip:[' from {ip}', 'muted'],
    operation_failed:['{shell}: operation failed', 'error'],
    app_unavailable:['{command}: {name}: application unavailable', 'error'],
    viewer_unavailable:['{command}: image viewer unavailable', 'error'],
    folder_unavailable:['{command}: {path}: directory is outside the file manager scope or unavailable', 'error'],
    su_password:['Password:', 'text'],
    su_auth_failed:['{command}: Authentication failure', 'error'],
    su_locked:['{command}: root account is locked', 'error'],
    su_unknown_user:['{command}: user {name} does not exist', 'error'],
    su_auth_unavailable:['{command}: authentication unavailable (HTTPS required)', 'error'],
    permission_denied:['{shell}: {command}: {path}: Permission denied', 'error'],
    rm_permission_denied:["{command}: cannot remove '{path}': Permission denied", 'error'],
    rm_read_only:["{command}: cannot remove '{path}': Read-only file system", 'error'],
    rm_missing:["{command}: cannot remove '{path}': No such file or directory", 'error'],
    rm_directory:["{command}: cannot remove '{path}': Is a directory", 'error'],
    rm_missing_operand:['{command}: missing operand\nusage: {usage}', 'error']
  };
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  const configuredText = (value, fallback) => typeof value === 'string' ? value.slice(0, 2000) : fallback;
  function fontSize(value) {
    if (typeof value === 'string' && /^\d+(?:\.\d*)?(?:px)?$/i.test(value.trim())) {
      value = Number(value.trim().replace(/px$/i, ''));
    }
    return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 24 ? value : DEFAULT_FONT_SIZE;
  }
  // Replacement values are never parsed again, so a path containing {command} stays a path.
  const interpolate = (template, values) => template.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? cleanText(values[key]) : match);
  function configure(value = {}) {
    const options = record(value), configuredCommands = record(options.commands);
    const validCommand = name => typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_.-]{0,31}$/.test(name);
    const commands = COMMANDS.map(id => {
      const setting = record(own(configuredCommands, id));
      return {id, name:validCommand(setting.name) ? setting.name : id,
        aliases:Array.isArray(setting.aliases) ? setting.aliases.slice(0, 32).filter(validCommand) : [],
        show_in_help:setting.show_in_help !== false,
        usage:configuredText(setting.usage, COMMAND_DETAILS[id][0]),
        description:configuredText(setting.description, COMMAND_DETAILS[id][1]),
        color:KINDS.includes(setting.color) ? setting.color : 'text'};
    });
    // Reserve all primary names before aliases; a collision must not make a handler unreachable.
    if (new Set(commands.map(command => command.name)).size !== commands.length) {
      commands.forEach(command => { command.name = command.id; });
    }
    const registry = new Map(commands.map(command => [command.name, command.id]));
    commands.forEach(command => {
      command.aliases = command.aliases.filter(alias => {
        if (registry.has(alias)) return false;
        registry.set(alias, command.id); return true;
      });
    });
    const shell = cleanText(configuredText(options.shell, '-bash')).slice(0, 80);
    const variables = Object.fromEntries(commands.map(command => [command.id, command.name]));
    variables.shell = shell;
    commands.forEach(command => {
      const values = {...variables, command:command.name};
      command.usage = interpolate(command.usage, values);
      command.description = interpolate(command.description, values);
    });
    const colors = {...DEFAULT_COLORS}, configuredColors = record(options.colors);
    Object.keys(colors).forEach(key => {
      const color = own(configuredColors, key);
      if (typeof color === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) colors[key] = color;
    });
    const configuredMessages = record(options.messages), messages = new Map();
    Object.entries(DEFAULT_MESSAGES).forEach(([key, [text, kind]]) => {
      const value = own(configuredMessages, key), setting = record(value);
      messages.set(key, {text:configuredText(typeof value === 'string' ? value : setting.text, text),
        kind:KINDS.includes(setting.color) ? setting.color : kind});
    });
    return {commands, colors, shell, fontSize:fontSize(options.font_size), resolveCommand:name => registry.get(name),
      message(key, values = {}) {
        const template = messages.get(key) || {text:String(key), kind:'text'};
        return {text:interpolate(template.text, {...variables, ...record(values)}), kind:template.kind};
      }};
  }
  function failure(key, values = {}) {
    const error = new Error(key);
    error.terminalKey = key; error.terminalValues = values;
    return error;
  }
  function accountName(value, fallback) {
    const name = String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
    return name && name !== '.' && name !== '..' ? name : fallback;
  }
  function tokenize(line, partial = false) {
    const tokens = [];
    let quote = '', escaped = false, token = null;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (!token && !/\s/.test(character)) token = {value:'', start:index};
      if (escaped) { token.value += character; escaped = false; }
      else if (character === '\\' && quote !== "'") escaped = true;
      else if (quote) {
        if (character === quote) quote = '';
        else token.value += character;
      } else if (character === '"' || character === "'") quote = character;
      else if (/\s/.test(character)) {
        if (token) { tokens.push(token); token = null; }
      } else token.value += character;
    }
    if (!partial && (quote || escaped)) throw failure(quote ? 'unclosed_quote' : 'incomplete_escape');
    if (token) tokens.push(token);
    return {tokens, quote, escaped};
  }
  function shellWord(value) {
    return value.replace(/[\\\s'"$`]/g, '\\$&');
  }
  function dateLabel(value) {
    if (!value) return '—';
    const pad = number => String(number).padStart(2, '0');
    return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate()) + ' ' + pad(value.getHours()) + ':' + pad(value.getMinutes());
  }
  function sizeLabel(size, human) {
    if (size === null) return '—';
    if (!human || size < 1024) return String(size);
    const units = ['K', 'M', 'G', 'T', 'P'];
    let unit = -1;
    do { size /= 1024; unit++; } while (size >= 1024 && unit < units.length - 1);
    return (size >= 10 ? size.toFixed(0) : size.toFixed(1)).replace(/\.0$/, '') + units[unit];
  }
  function create(options = {}) {
    options = record(options);
    const presentation = configure(options);
    const commandDetails = new Map(presentation.commands.map(command => [command.id, command]));
    const commandNames = presentation.commands.flatMap(command => [command.name, ...command.aliases]);
    const filesystem = options.filesystem || filesystemCore.create({...options, rootEnabled:record(options.root).enable === true});
    const {username, home, nodes, pathOf} = filesystem;
    const hostname = accountName(options.hostname, 'blanktime');
    const rootOptions = record(options.root), verifier = record(rootOptions.verifier);
    const rootEnabled = rootOptions.enable === true;
    const rootConfigured = rootEnabled && verifier.algorithm === 'PBKDF2-SHA256' &&
      verifier.iterations === 210000 &&
      typeof verifier.salt === 'string' && /^[a-f\d]{32}$/i.test(verifier.salt) &&
      typeof verifier.hash === 'string' && /^[a-f\d]{64}$/i.test(verifier.hash);
    let identity = {username, home, isRoot:false}, pendingAuthentication = null;
    const sessions = [];
    let cwd = home;
    const lookup = value => filesystem.resolve(value, {cwd, home:identity.home, isRoot:identity.isRoot});
    const promptPath = () => cwd === identity.home ? '~' : cwd.startsWith(identity.home + '/') ? '~' + cwd.slice(identity.home.length) : cwd;
    const sorted = node => filesystem.list(node);
    function enterRoot(login) {
      sessions.push({identity, cwd});
      identity = {username:'root', home:'/root', isRoot:true};
      if (login) cwd = identity.home;
    }
    function finishAuthentication(accepted) {
      const request = pendingAuthentication;
      pendingAuthentication = null;
      if (!request) return {lines:[], cwd};
      if (accepted === true) {
        enterRoot(request.login);
        return {lines:[], cwd};
      }
      return {lines:[presentation.message('su_auth_failed', request.context)], failed:true, cwd};
    }
    function execute(line) {
      // Password input is handled separately: never parse, echo or retain it as a command.
      if (pendingAuthentication) return {lines:[], failed:true, cwd};
      const lines = [];
      let action, command = '', commandId, failed = false;
      line = String(line || '');
      const context = () => ({command, input:line, usage:commandDetails.get(commandId)?.usage || ''});
      const out = (text, kind = commandDetails.get(commandId)?.color || 'text', parts) =>
        lines.push({text:String(text), ...(kind !== 'text' ? {kind} : {}), ...(parts ? {parts} : {})});
      const message = (key, values = {}) => presentation.message(key, {...context(), ...values});
      const report = (key, values) => lines.push(message(key, values));
      try {
        if (line.length > MAX_INPUT) throw failure('input_too_long', {limit:MAX_INPUT});
        const args = tokenize(line).tokens.map(token => token.value);
        command = args.shift() || '';
        commandId = presentation.resolveCommand(command);
        const requireCount = (minimum, maximum) => {
          if (args.length < minimum || args.length > maximum) throw failure('invalid_arguments');
        };
        if (!command) return {lines, cwd};
        if (commandId === 'help') {
          requireCount(0, 1);
          if (args.length) {
            const item = commandDetails.get(presentation.resolveCommand(args[0]));
            if (!item) throw failure('help_not_found', {target:args[0]});
            out(item.usage);
            if (item.description) out(item.description);
          } else {
            const intro = message('help_intro');
            if (intro.text) lines.push(intro);
            const visibleCommands = presentation.commands.filter(item => item.show_in_help);
            const width = Math.max(0, ...visibleCommands.map(item => item.usage.length)) + 2;
            visibleCommands.forEach(item => out(item.usage.padEnd(width) + item.description));
          }
        } else if (commandId === 'pwd') {
          requireCount(0, 0); out(cwd);
        } else if (commandId === 'cd') {
          requireCount(0, 1);
          const node = lookup(args.length ? args[0] : identity.home);
          if (node.type !== 'directory') throw failure('not_directory', {path:args[0]});
          cwd = pathOf(node);
        } else if (commandId === 'ls' || commandId === 'll') {
          let long = commandId === 'll', all = false, human = false, flags = true;
          const paths = [];
          args.forEach(argument => {
            if (flags && argument === '--') { flags = false; return; }
            if (flags && argument.startsWith('-') && argument !== '-') {
              for (const flag of argument.slice(1)) {
                if (flag === 'l') long = true;
                else if (flag === 'a') all = true;
                else if (flag === 'h') human = true;
                else throw failure('invalid_option', {option:'-' + flag});
              }
            } else paths.push(argument);
          });
          if (paths.length > 1) throw failure('too_many_paths');
          const node = lookup(paths.length ? paths[0] : '.');
          const empty = node.type === 'directory' && node.children.size === 0;
          let entries = node.type === 'directory' ? sorted(node).filter(child => all || !child.name.startsWith('.')) : [node];
          if ((all || empty) && node.type === 'directory') entries = [{...node, name:'.'}, {...(node.parent || node), name:'..'}, ...entries];
          if (empty) report('total', {total:0});
          entries.forEach(entry => {
            const directory = entry.type === 'directory';
            const name = entry.name + (directory ? '/' : '');
            if (empty || long) {
              const size = sizeLabel(entry.size, human), date = dateLabel(entry.date);
              const nameRole = directory ? 'directory' : entry.type === 'image' ? 'image' : entry.type === 'article' ? 'document' : entry.type === 'music' ? 'music' : 'name';
              const owner = directory ? entry.owner : username;
              const parts = [{text:directory ? entry.mode : '-r--r--r--', role:'permission'}, {text:'  '}];
              // Empty directories retain their original size-before-owner column order.
              if (empty) parts.push({text:size, role:'size'}, {text:'  '});
              parts.push({text:owner, role:'owner'}, {text:' '}, {text:owner, role:'owner'});
              if (!empty) parts.push({text:'  ' + ' '.repeat(Math.max(0, 6 - size.length))}, {text:size, role:'size'});
              parts.push({text:'  '}, {text:date, role:'date'},
                {text:(empty ? '' : ' '.repeat(Math.max(0, 16 - date.length))) + '  '}, {text:name, role:nameRole});
              out(parts.map(part => part.text).join(''), directory ? 'directory' : undefined, parts);
            } else out(name, directory ? 'directory' : undefined);
          });
        } else if (commandId === 'open') {
          requireCount(1, 1);
          const node = lookup(args[0]);
          if (node.type === 'directory') action = {type:'folder', path:pathOf(node), appId:'files'};
          else if (node.type === 'article') action = {type:'article', url:node.url};
          else if (node.type === 'app') action = {type:'app', id:node.appId};
          else if (node.type === 'music') action = {type:'music', trackKey:node.trackKey};
          else if (node.type === 'image') action = {type:'image', items:node.parent.images.map(item => ({...item})), index:node.imageIndex, source:node.parent.name};
          else throw failure('operation_failed');
          report('opening', {name:node.name, path:args[0]});
        } else if (commandId === 'search') {
          if (!args.length || !args.join(' ').trim()) throw failure('search_usage');
          const query = args.join(' ').toLocaleLowerCase();
          let count = 0;
          for (const [path, node] of nodes) {
            if (!['article', 'image', 'music'].includes(node.type)) continue;
            if (!(path + ' ' + (node.search || '')).toLocaleLowerCase().includes(query)) continue;
            out(path); count++;
          }
          if (!count) report('search_empty');
        } else if (commandId === 'su') {
          let login = false, flags = true;
          const users = [];
          args.forEach(argument => {
            if (flags && argument === '--') { flags = false; return; }
            if (flags && ['-', '-l', '--login'].includes(argument)) { login = true; return; }
            if (flags && argument.startsWith('-')) throw failure('invalid_option', {option:argument});
            users.push(argument);
          });
          if (users.length > 1) throw failure('invalid_arguments');
          const target = users.length ? users[0] : 'root';
          if (target !== 'root') throw failure('su_unknown_user', {name:target});
          if (!rootConfigured) throw failure('su_locked');
          if (sessions.length >= 64) throw failure('operation_failed');
          if (identity.isRoot) enterRoot(login);
          else {
            pendingAuthentication = {login, context:context()};
            action = {type:'authenticate'};
          }
        } else if (commandId === 'rm') {
          let recursive = false, force = false, flags = true;
          const paths = [];
          args.forEach(argument => {
            if (flags && argument === '--') { flags = false; return; }
            if (flags && argument.startsWith('-') && argument !== '-') {
              for (const flag of argument.slice(1)) {
                if (flag === 'r' || flag === 'R') recursive = true;
                else if (flag === 'f') force = true;
                else throw failure('invalid_option', {option:'-' + flag});
              }
            } else paths.push(argument);
          });
          if (!paths.length && !force) throw failure('rm_missing_operand');
          // The mapped filesystem remains immutable for every identity in this release.
          for (const path of paths) {
            let node;
            try { node = lookup(path); }
            catch (error) {
              if (error.terminalKey === 'no_such_path' && force) continue;
              failed = true;
              const key = error.terminalKey === 'no_such_path' ? 'rm_missing' :
                error.terminalKey === 'permission_denied' ? 'rm_permission_denied' : error.terminalKey;
              report(key || 'operation_failed', {path});
              continue;
            }
            failed = true;
            report(node.type === 'directory' && !recursive ? 'rm_directory' :
              identity.isRoot ? 'rm_read_only' : 'rm_permission_denied', {path});
          }
        } else if (commandId === 'clear' || commandId === 'exit') {
          requireCount(0, 0);
          if (commandId === 'exit' && sessions.length) {
            const previous = sessions.pop();
            identity = previous.identity; cwd = previous.cwd;
          } else action = {type:commandId};
        } else throw failure('unknown_command');
      } catch (error) {
        action = undefined;
        failed = true;
        // Parsing can fail before dispatch; recover only bounded display context, never execute it.
        if (!command) {
          command = tokenize(line.slice(0, MAX_INPUT), true).tokens[0]?.value || '';
          commandId = presentation.resolveCommand(command);
        }
        report(error.terminalKey || 'operation_failed', error.terminalValues);
      }
      if (lines.length > MAX_LINES) lines.splice(MAX_LINES, lines.length, message('too_many_results', {limit:MAX_LINES}));
      return {lines, ...(action ? {action, context:context()} : {}), ...(failed ? {failed:true} : {}), cwd};
    }
    function complete(line) {
      line = String(line || '');
      if (pendingAuthentication) return {value:'', candidates:[]};
      if (line.length > MAX_INPUT) return {value:line, candidates:[]};
      const parsed = tokenize(line, true);
      const tokens = parsed.tokens;
      const endsInSpace = !parsed.quote && !parsed.escaped && /\s$/.test(line);
      const active = endsInSpace || !tokens.length ? {value:'', start:line.length} : tokens[tokens.length - 1];
      const tokenCount = tokens.length + (endsInSpace ? 1 : 0);
      let matches, prefix = '';
      if (tokenCount <= 1 || (tokenCount === 2 && presentation.resolveCommand(tokens[0].value) === 'help')) {
        matches = commandNames.filter(command => command.startsWith(active.value));
      }
      else {
        const command = presentation.resolveCommand(tokens[0].value);
        if (command === 'su') {
          const argumentsBefore = tokens.slice(1, endsInSpace ? tokens.length : -1).map(token => token.value);
          if (argumentsBefore.some(value => !['-', '-l', '--login', '--'].includes(value))) return {value:line, candidates:[]};
          matches = 'root'.startsWith(active.value) ? ['root'] : [];
        } else {
          if (!['cd', 'open', 'ls', 'll', 'rm'].includes(command)) return {value:line, candidates:[]};
          if (active.value === '~') return {value:line.slice(0, active.start) + '~/', candidates:['~/']};
          const slash = active.value.lastIndexOf('/');
          prefix = slash >= 0 ? active.value.slice(0, slash + 1) : '';
          const fragment = active.value.slice(slash + 1);
          let parent;
          try { parent = lookup(prefix || '.'); } catch { return {value:line, candidates:[]}; }
          if (parent.type !== 'directory') return {value:line, candidates:[]};
          matches = sorted(parent).filter(node => node.name.startsWith(fragment) && (command !== 'cd' || node.type === 'directory'))
            .map(node => node.name + (node.type === 'directory' ? '/' : ''));
        }
      }
      if (!matches.length) return {value:line, candidates:[]};
      let common = matches[0];
      for (const match of matches.slice(1)) while (!match.startsWith(common)) common = common.slice(0, -1);
      // If a multi-match has no shared characters, preserve the user's incomplete quoting.
      if (matches.length > 1 && !common) return {value:line, candidates:matches};
      const completed = prefix + common;
      const suffix = matches.length === 1 && !common.endsWith('/') ? ' ' : '';
      return {value:line.slice(0, active.start) + shellWord(completed) + suffix, candidates:matches};
    }
    return {execute, complete, finishAuthentication, cancelAuthentication:() => { pendingAuthentication = null; },
      getIdentity:() => ({...identity}), getCwd:() => cwd, getPromptPath:promptPath, home, username, hostname};
  }
  return {create, configure};
});
