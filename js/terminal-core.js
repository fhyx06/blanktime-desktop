(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.blanktimeTerminalCore = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  const COMMANDS = ['help', 'pwd', 'ls', 'll', 'cd', 'open', 'search', 'clear', 'exit'];
  const MAX_INPUT = 4096;
  const MAX_LINES = 1000;
  const cleanText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  const KINDS = ['text', 'muted', 'directory', 'error', 'success', 'welcome', 'warning', 'info'];
  const DEFAULT_COLORS = {
    text:'#d6e1ed', muted:'#97a8ba', directory:'#83bcf3', error:'#ffabb0',
    success:'#86d6af', welcome:'#f0f5fa', warning:'#f2c97d', info:'#83bcf3',
    prompt:'#86d6af', background:'#151c24', input:'#f0f5fa', caret:'#b1e5c8'
  };
  const COMMAND_DETAILS = {
    help:['{command}', '显示命令帮助'], pwd:['{command}', '显示当前目录'],
    ls:['{command} [-lah] [路径]', '列出目录；-l 详细信息，-a 隐藏项，-h 易读大小'],
    ll:['{command} [路径]', '等同于 {ls} -l（也可搭配 -a、-h）'],
    cd:['{command} [路径]', '切换目录；无参数返回 ~'],
    open:['{command} 路径', '打开文章、图片、应用或目录'],
    search:['{command} 关键词', '搜索文章与相册图片'],
    clear:['{command}', '清空终端输出'], exit:['{command}', '关闭终端']
  };
  const DEFAULT_MESSAGES = {
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
    operation_failed:['{shell}: operation failed', 'error'],
    app_unavailable:['{command}: {name}: application unavailable', 'error'],
    viewer_unavailable:['{command}: image viewer unavailable', 'error'],
    folder_unavailable:['{command}: {path}: album directory not found', 'error']
  };
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  const configuredText = (value, fallback) => typeof value === 'string' ? value.slice(0, 2000) : fallback;
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
    return {commands, colors, shell, resolveCommand:name => registry.get(name),
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
  function fileName(value, fallback) {
    const name = cleanText(value).replace(/\//g, '／').replace(/\\/g, '＼').trim().slice(0, 200);
    return name && name !== '.' && name !== '..' ? name : fallback;
  }
  function imageName(name, url) {
    const extension = /\.(jpe?g|png|webp|gif|avif|bmp|svg|ico|tiff?)$/i;
    const label = fileName(name, '未命名图片');
    if (extension.test(label)) return label;
    // Only the original pathname identifies a format; signed/query URLs stay untouched.
    try {
      const path = new URL(String(url), 'https://terminal.invalid/').pathname;
      const suffix = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)).match(extension);
      if (suffix) return label + '.' + suffix[1].toLowerCase();
    } catch {}
    return label;
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
  function validDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(typeof value === 'string' && /^\d{11,}$/.test(value) ? Number(value) : value);
    return Number.isFinite(date.valueOf()) ? date : null;
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
    const username = accountName(options.username, 'visitor');
    const hostname = accountName(options.hostname, 'blanktime');
    const home = '/home/' + username;
    const createdAt = validDate(options.createdAt) || new Date();
    const root = {name:'', type:'directory', parent:null, children:new Map(), size:0, date:createdAt};
    const nodes = new Map([['/', root]]);
    function pathOf(node) {
      if (!node.parent) return '/';
      return (pathOf(node.parent).replace(/\/$/, '')) + '/' + node.name;
    }
    function insert(parent, proposedName, type, data = {}) {
      let name = proposedName, count = 2;
      const dot = proposedName.lastIndexOf('.');
      const stem = dot > 0 ? proposedName.slice(0, dot) : proposedName;
      const extension = dot > 0 ? proposedName.slice(dot) : '';
      while (parent.children.has(name)) name = stem + ' (' + count++ + ')' + extension;
      const node = {name, type, parent, size:null, date:null, ...data};
      if (type === 'directory') {
        node.children = new Map();
        node.size = 0;
        node.date = createdAt;
      }
      parent.children.set(name, node);
      nodes.set(pathOf(node), node);
      return node;
    }
    const homes = insert(root, 'home', 'directory');
    const userHome = insert(homes, username, 'directory');
    const desktop = insert(userHome, 'Desktop', 'directory');
    const documents = insert(userHome, 'Documents', 'directory');
    const postsRoot = insert(documents, 'Posts', 'directory');
    const pictures = insert(userHome, 'Pictures', 'directory');
    const albumsRoot = insert(pictures, 'Albums', 'directory');
    insert(userHome, 'Music', 'directory');
    (Array.isArray(options.apps) ? options.apps : []).forEach(app => {
      if (!app || !app.id) return;
      insert(desktop, fileName(app.name, String(app.id)).replace(/\.desktop$/i, '') + '.desktop', 'app', {appId:String(app.id)});
    });
    // Source identifiers establish a stable order for duplicate visible names.
    (Array.isArray(options.posts) ? options.posts : []).filter(post => post && post.url).slice().sort((a, b) => String(a.url).localeCompare(String(b.url))).forEach(post => {
      insert(postsRoot, fileName(post.title, '未命名文章').replace(/\.md$/i, '') + '.md', 'article', {
        url:String(post.url), date:validDate(post.date), search:cleanText(post.search || post.title)
      });
    });
    (Array.isArray(options.albums) ? options.albums : []).filter(Boolean).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(album => {
      const folder = insert(albumsRoot, fileName(album.name, String(album.id || '未命名相册')), 'directory', {folderId:String(album.id || '')});
      folder.images = [];
      (Array.isArray(album.images) ? album.images : []).forEach(image => {
        if (!image || !image.url) return;
        const item = {name:imageName(image.name, image.url), url:String(image.url), wallpaper:image.wallpaper === true,
          size:image.size !== '' && image.size !== null && image.size !== undefined && Number.isSafeInteger(Number(image.size)) && Number(image.size) >= 0 ? Number(image.size) : null};
        const index = folder.images.length;
        folder.images.push(item);
        const node = insert(folder, item.name, 'image', {size:item.size, imageIndex:index});
        item.name = node.name;
      });
    });
    let cwd = home;
    function lookup(value = '.') {
      let path = String(value);
      if (!path) throw failure('no_such_path', {path:value});
      if (path === '~') path = home;
      else if (path.startsWith('~/')) path = home + path.slice(1);
      let node = path.startsWith('/') ? root : nodes.get(cwd);
      // Resolve in traversal order: file/.. and missing/.. must not become valid paths.
      for (const part of path.split('/').filter(Boolean)) {
        if (node.type !== 'directory') throw failure('not_directory', {path:value});
        if (part === '.') continue;
        if (part === '..') node = node.parent || root;
        else {
          node = node.children.get(part);
          if (!node) throw failure('no_such_path', {path:value});
        }
      }
      if (path.endsWith('/') && node.type !== 'directory') throw failure('not_directory', {path:value});
      return node;
    }
    const promptPath = () => cwd === home ? '~' : cwd.startsWith(home + '/') ? '~' + cwd.slice(home.length) : cwd;
    const sorted = node => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    function execute(line) {
      const lines = [];
      let action, command = '', commandId, failed = false;
      line = String(line || '');
      const context = () => ({command, input:line, usage:commandDetails.get(commandId)?.usage || ''});
      const out = (text, kind = commandDetails.get(commandId)?.color || 'text') =>
        lines.push({text:String(text), ...(kind !== 'text' ? {kind} : {})});
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
          requireCount(0, 0);
          const visibleCommands = presentation.commands.filter(item => item.show_in_help);
          const width = Math.max(0, ...visibleCommands.map(item => item.usage.length)) + 2;
          visibleCommands.forEach(item => out(item.usage.padEnd(width) + item.description));
        } else if (commandId === 'pwd') {
          requireCount(0, 0); out(cwd);
        } else if (commandId === 'cd') {
          requireCount(0, 1);
          const node = lookup(args.length ? args[0] : home);
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
            if (empty) out('drwxr-xr-x  ' + sizeLabel(entry.size, human) + '  ' + username + ' ' + username + '  ' + dateLabel(entry.date) + '  ' + name, 'directory');
            else if (long) out((directory ? 'drwxr-xr-x' : '-r--r--r--') + '  ' + username + ' ' + username + '  ' + sizeLabel(entry.size, human).padStart(6) + '  ' + dateLabel(entry.date).padEnd(16) + '  ' + name, directory ? 'directory' : undefined);
            else out(name, directory ? 'directory' : undefined);
          });
        } else if (commandId === 'open') {
          requireCount(1, 1);
          const node = lookup(args[0]);
          if (node.type === 'directory') {
            const path = pathOf(node);
            if (node === postsRoot) action = {type:'folder', path, appId:'files'};
            else if (node === albumsRoot || node.folderId !== undefined) action = {type:'folder', path, appId:'album', ...(node.folderId !== undefined ? {folderId:node.folderId} : {})};
            else if (path === home + '/Music' && [...desktop.children.values()].some(app => app.appId === 'music')) action = {type:'app', id:'music'};
            else cwd = path;
          }
          else if (node.type === 'article') action = {type:'article', url:node.url};
          else if (node.type === 'app') action = {type:'app', id:node.appId};
          else action = {type:'image', items:node.parent.images.map(item => ({...item})), index:node.imageIndex, source:node.parent.name};
          report('opening', {name:node.name, path:args[0]});
        } else if (commandId === 'search') {
          if (!args.length || !args.join(' ').trim()) throw failure('search_usage');
          const query = args.join(' ').toLocaleLowerCase();
          let count = 0;
          for (const [path, node] of nodes) {
            if (!['article', 'image'].includes(node.type)) continue;
            if (!(path + ' ' + (node.search || '')).toLocaleLowerCase().includes(query)) continue;
            out(path); count++;
          }
          if (!count) report('search_empty');
        } else if (commandId === 'clear' || commandId === 'exit') {
          requireCount(0, 0); action = {type:commandId};
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
      if (line.length > MAX_INPUT) return {value:line, candidates:[]};
      const parsed = tokenize(line, true);
      const tokens = parsed.tokens;
      const endsInSpace = !parsed.quote && !parsed.escaped && /\s$/.test(line);
      const active = endsInSpace || !tokens.length ? {value:'', start:line.length} : tokens[tokens.length - 1];
      const tokenCount = tokens.length + (endsInSpace ? 1 : 0);
      let matches, prefix = '';
      if (tokenCount <= 1) matches = commandNames.filter(command => command.startsWith(active.value));
      else {
        const command = presentation.resolveCommand(tokens[0].value);
        if (!['cd', 'open', 'ls', 'll'].includes(command)) return {value:line, candidates:[]};
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
      if (!matches.length) return {value:line, candidates:[]};
      let common = matches[0];
      for (const match of matches.slice(1)) while (!match.startsWith(common)) common = common.slice(0, -1);
      // If a multi-match has no shared characters, preserve the user's incomplete quoting.
      if (matches.length > 1 && !common) return {value:line, candidates:matches};
      const completed = prefix + common;
      const suffix = matches.length === 1 && !common.endsWith('/') ? ' ' : '';
      return {value:line.slice(0, active.start) + shellWord(completed) + suffix, candidates:matches};
    }
    return {execute, complete, getCwd:() => cwd, getPromptPath:promptPath, home, username, hostname};
  }
  return {create, configure};
});
