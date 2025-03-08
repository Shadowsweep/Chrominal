document.addEventListener('DOMContentLoaded', function() {
  const terminal = document.getElementById('terminal');
  const commandInput = document.getElementById('command-input');
  const terminalContainer = document.querySelector('.terminal-container');
  
  const MAX_HISTORY = 10; // Maximum number of commands to keep in history
  let commandHistory = [];
  let historyIndex = -1;
  let terminalHistory = [];
  let tabsList = [];
  let tabCompletionIndex = -1;
  let matchingTabs = [];
  let originalInput = '';

  // Initialize storage with error handling
  async function initializeStorage() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['commandHistory', 'terminalHistory'], (items) => {
          if (chrome.runtime.lastError) {
            console.error('Storage error:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(items);
          }
        });
      });

      if (result.commandHistory) {
        // Keep only the last 10 commands
        commandHistory = result.commandHistory.slice(-MAX_HISTORY);
      }
      
      clearTerminal();
      appendToTerminal('Chrome Terminal v1.0 [Enhanced with Tab Completion]', 'info');
      appendToTerminal('Type "help" for available commands', 'info');
    } catch (error) {
      clearTerminal();
      appendToTerminal('Chrome Terminal v1.0 [Enhanced with Tab Completion]', 'info');
      appendToTerminal('Type "help" for available commands', 'info');
    }
  }

  // Clear terminal and reset history
  function clearTerminal() {
    terminal.innerHTML = '';
    terminalHistory = [];
  }

  // Safe storage saving function with Promise wrapper
  async function saveToStorage(key, value) {
    try {
      if (key === 'commandHistory') {
        // Keep only the last 10 commands
        value = value.slice(-MAX_HISTORY);
      }
      
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      // console.error(`Failed to save ${key} to storage:`, error);
    }
  }

  // Handle tab completion
  async function handleTabCompletion() {
    try {
      const input = commandInput.value;
      const parts = input.split(' ');
      
      if (parts[0] !== 'cd') return;

      if (tabCompletionIndex === -1) {
        originalInput = input;
        
        if (tabsList.length === 0) {
          await commands.tabs();
        }

        const searchTerm = parts[1]?.toLowerCase() || '';

        matchingTabs = tabsList.filter(tab => 
          tab.title.toLowerCase().includes(searchTerm)
        );

        tabCompletionIndex = 0;
      } else {
        tabCompletionIndex = (tabCompletionIndex + 1) % matchingTabs.length;
      }

      if (matchingTabs.length > 0) {
        commandInput.value = `cd ${matchingTabs[tabCompletionIndex].title}`;
        
        if (tabCompletionIndex === 0 && matchingTabs.length > 1) {
          appendToTerminal('Possible completions:', 'info');
          matchingTabs.forEach((tab, index) => {
            appendToTerminal(`${index + 1}. ${tab.title}`, 'info');
          });
        }
      }
    } catch (error) {
      // console.error('Tab completion error:', error);
      appendToTerminal('Error during tab completion', 'error');
    }
  }

  // Reset tab completion state
  function resetTabCompletion() {
    tabCompletionIndex = -1;
    matchingTabs = [];
    originalInput = '';
  }

  function appendToTerminal(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = `output-line ${type}-line`;
    line.textContent = type === 'command' ? `$ ${text}` : text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;

    try {
      terminalHistory.push({ text, type });
      // Keep only recent terminal history
      if (terminalHistory.length > MAX_HISTORY * 3) { // Keep slightly more terminal output than commands
        clearTerminal();
        appendToTerminal('Chrome Terminal v1.0 [Enhanced with Tab Completion]', 'info');
        appendToTerminal('Type "help" for available commands', 'info');
        // Restore only the most recent history
        terminalHistory.slice(-MAX_HISTORY).forEach(line => {
          appendToTerminal(line.text, line.type);
        });
      }
    } catch (error) {
      // console.error('Failed to save terminal history:', error);
    }
  }

  const commands = {
    help: () => {
      return `Available commands:
- cd <tab number/name>: Switch to specified tab (use Tab key for completion)
- newtab [url]: Open new tab
- tabs: List open tabs
- close: Close current tab
- search <query>: Search Google for the specified query
- bookmark: Bookmark current tab
- bookmarks [n]: Show last n bookmarks (default 10)
- reload: Reload current tab
- duplicate: Duplicate current tab
- pin: Toggle pin state of current tab
- mute: Toggle mute state of current tab
- info: Show detailed information about current tab
- clear: Clear terminal display
- group [name]: Create a tab group with current tab
- incognito: Open new incognito window
- closewindow: Close current window
- fullscreen: Toggle fullscreen mode
- title: Get current tab title
- help: Show commands`;
    },

    search: async (query) => {
      if (!query) return 'Usage: search <query>';
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await chrome.tabs.create({ url: searchUrl });
      return 'Search results opened in new tab';
    },
    
    newtab: async (url) => {
      try {
        await chrome.tabs.create({ url: url || 'chrome://newtab' });
        return 'New tab opened successfully';
      } catch (error) {
        throw new Error(`Failed to open new tab: ${error.message}`);
      }
    },
    
    tabs: async () => {
      try {
        const tabs = await chrome.tabs.query({});
        tabsList = tabs;
        return tabs.map((tab, index) => 
          `${index + 1}. ${tab.title.substring(0, 70)}${tab.title.length > 70 ? '...' : ''}`
        ).join('\n');
      } catch (error) {
        throw new Error(`Failed to list tabs: ${error.message}`);
      }
    },

    cd: async (target) => {
      if (!target) {
        return 'Usage: cd <tab number or tab name>';
      }

      try {
        if (tabsList.length === 0) {
          await commands.tabs();
        }

        let targetTab;

        if (!isNaN(target)) {
          const index = parseInt(target) - 1;
          targetTab = tabsList[index];
        } else {
          const searchTerm = target.toLowerCase();
          targetTab = tabsList.find(tab => 
            tab.title.toLowerCase().includes(searchTerm)
          );
        }

        if (!targetTab) {
          throw new Error('Tab not found. Use "tabs" command to see available tabs.');
        }

        await chrome.tabs.update(targetTab.id, { active: true });
        await chrome.windows.update(targetTab.windowId, { focused: true });
        
        return `Switched to tab: ${targetTab.title}`;
      } catch (error) {
        throw new Error(`Failed to switch tab: ${error.message}`);
      }
    },
    
    close: async () => {
      try {
        const tab = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab.length === 0) throw new Error('No active tab found');
        await chrome.tabs.remove(tab[0].id);
        return 'Tab closed successfully';
      } catch (error) {
        throw new Error(`Failed to close tab: ${error.message}`);
      }
    },
    
    bookmark: async () => {
      try {
        const tab = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab.length === 0) throw new Error('No active tab found');
        await chrome.bookmarks.create({
          title: tab[0].title,
          url: tab[0].url
        });
        return 'Bookmark added successfully';
      } catch (error) {
        throw new Error(`Failed to add bookmark: ${error.message}`);
      }
    },

    bookmarks: async (limit = 10) => {
      try {
        const items = await chrome.bookmarks.getRecent(parseInt(limit));
        return items.map((item, index) => 
          `${index + 1}. ${item.title}\n   ${item.url}`
        ).join('\n');
      } catch (error) {
        throw new Error(`Failed to fetch bookmarks: ${error.message}`);
      }
    },

    history: async (limit = 10) => {
      try {
        const items = await chrome.history.search({
          text: '',
          maxResults: parseInt(limit),
          startTime: 0
        });
        return items.map((item, index) => 
          `${index + 1}. ${new Date(item.lastVisitTime).toLocaleString()}
   ${item.title ? item.title.substring(0, 70) + (item.title.length > 70 ? '...' : '') : 'No title'}
   ${item.url}`
        ).join('\n');
      } catch (error) {
        throw new Error(`Failed to fetch history: ${error.message}`);
      }
    },
    
    clear: () => {
      terminal.innerHTML = '';
      return '';
    },

    clearhistory: () => {
      terminalHistory = [];
      saveToStorage('terminalHistory', []);
      return 'Terminal history cleared successfully';
    },

    reload: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.reload(tab.id);
        return 'Page reloaded successfully';
      } catch (error) {
        throw new Error(`Failed to reload page: ${error.message}`);
      }
    },

    duplicate: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.duplicate(tab.id);
        return 'Tab duplicated successfully';
      } catch (error) {
        throw new Error(`Failed to duplicate tab: ${error.message}`);
      }
    },

    pin: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.update(tab.id, {pinned: !tab.pinned});
        return `Tab ${tab.pinned ? 'unpinned' : 'pinned'} successfully`;
      } catch (error) {
        throw new Error(`Failed to toggle pin state: ${error.message}`);
      }
    },

    mute: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.update(tab.id, {muted: !tab.mutedInfo.muted});
        return `Tab ${tab.mutedInfo.muted ? 'unmuted' : 'muted'} successfully`;
      } catch (error) {
        throw new Error(`Failed to toggle mute state: ${error.message}`);
      }
    },

    back: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.goBack(tab.id);
        return 'Navigated back successfully';
      } catch (error) {
        throw new Error(`Failed to navigate back: ${error.message}`);
      }
    },

    forward: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.goForward(tab.id);
        return 'Navigated forward successfully';
      } catch (error) {
        throw new Error(`Failed to navigate forward: ${error.message}`);
      }
    },

    info: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        return `Current tab information:
Title: ${tab.title}
URL: ${tab.url}
ID: ${tab.id}
Index: ${tab.index}
Pinned: ${tab.pinned}
Muted: ${tab.mutedInfo?.muted || false}
Incognito: ${tab.incognito}`;
      } catch (error) {
        throw new Error(`Failed to get tab info: ${error.message}`);
      }
    },

    group: async (name) => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const group = await chrome.tabs.group({tabIds: tab.id});
        if (name) {
          await chrome.tabGroups.update(group, {title: name});
        }
        return `Tab ${name ? `grouped as "${name}"` : 'grouped'} successfully`;
      } catch (error) {
        throw new Error(`Failed to group tab: ${error.message}`);
      }
    },

    ungroup: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.ungroup(tab.id);
        return 'Tab ungrouped successfully';
      } catch (error) {
        throw new Error(`Failed to ungroup tab: ${error.message}`);
      }
    },

    // New commands added below

    screenshot: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
        // Download the screenshot
        await chrome.downloads.download({
          url: dataUrl,
          filename: `screenshot_${new Date().toISOString().replace(/:/g, '-')}.png`,
          saveAs: true
        });
        return 'Screenshot captured and saved successfully';
      } catch (error) {
        throw new Error(`Failed to capture screenshot: ${error.message}`);
      }
    },

    downloads: async (limit = 10) => {
      try {
        const items = await chrome.downloads.search({
          limit: parseInt(limit),
          orderBy: ['-startTime']
        });
        return items.map((item, index) => 
          `${index + 1}. ${item.filename.split('/').pop() || item.filename.split('\\').pop() || 'Unknown'}
   URL: ${item.url.substring(0, 70)}${item.url.length > 70 ? '...' : ''}
   Status: ${item.state} (${Math.round(item.bytesReceived / 1024)} KB / ${Math.round(item.totalBytes / 1024)} KB)
   Date: ${new Date(item.startTime).toLocaleString()}`
        ).join('\n');
      } catch (error) {
        throw new Error(`Failed to fetch downloads: ${error.message}`);
      }
    },

    extensions: async () => {
      try {
        const extensions = await chrome.management.getAll();
        return extensions
          .filter(ext => !ext.isApp) // Filter out Chrome apps, keep only extensions
          .map((ext, index) => 
            `${index + 1}. ${ext.name} (${ext.version})
   ID: ${ext.id}
   Enabled: ${ext.enabled}
   Description: ${ext.description.substring(0, 100)}${ext.description.length > 100 ? '...' : ''}`
          ).join('\n');
      } catch (error) {
        throw new Error(`Failed to list extensions: ${error.message}`);
      }
    },

    windows: async () => {
      try {
        const windows = await chrome.windows.getAll({populate: true});
        return windows.map((win, index) => 
          `Window ${index + 1} (${win.focused ? 'Focused' : 'Not Focused'})
   Type: ${win.type}
   State: ${win.state}
   Incognito: ${win.incognito}
   Tab count: ${win.tabs?.length || 0}`
        ).join('\n');
      } catch (error) {
        throw new Error(`Failed to list windows: ${error.message}`);
      }
    },

    focus: async (windowIndex) => {
      try {
        if (!windowIndex || isNaN(windowIndex)) {
          return 'Usage: focus <window number>';
        }
        
        const windows = await chrome.windows.getAll();
        const index = parseInt(windowIndex) - 1;
        
        if (index < 0 || index >= windows.length) {
          throw new Error('Window not found. Use "windows" command to see available windows.');
        }
        
        await chrome.windows.update(windows[index].id, {focused: true});
        return `Focused on window ${windowIndex}`;
      } catch (error) {
        throw new Error(`Failed to focus window: ${error.message}`);
      }
    },

    incognito: async () => {
      try {
        await chrome.windows.create({incognito: true});
        return 'New incognito window opened successfully';
      } catch (error) {
        throw new Error(`Failed to open incognito window: ${error.message}`);
      }
    },

    closewindow: async () => {
      try {
        const windows = await chrome.windows.getCurrent();
        await chrome.windows.remove(windows.id);
        return 'Window closed successfully';
      } catch (error) {
        throw new Error(`Failed to close window: ${error.message}`);
      }
    },

    fullscreen: async () => {
      try {
        const window = await chrome.windows.getCurrent();
        const newState = window.state === 'fullscreen' ? 'normal' : 'fullscreen';
        await chrome.windows.update(window.id, {state: newState});
        return `Window ${newState === 'fullscreen' ? 'entered' : 'exited'} fullscreen mode`;
      } catch (error) {
        throw new Error(`Failed to toggle fullscreen: ${error.message}`);
      }
    },

    url: async (newUrl) => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (newUrl) {
          // If URL doesn't start with http or https, assume http
          if (!/^(http|https):\/\//.test(newUrl)) {
            newUrl = 'http://' + newUrl;
          }
          await chrome.tabs.update(tab.id, {url: newUrl});
          return `URL updated to: ${newUrl}`;
        } else {
          return `Current URL: ${tab.url}`;
        }
      } catch (error) {
        throw new Error(`Failed to get/set URL: ${error.message}`);
      }
    },

    title: async () => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        return `Current title: ${tab.title}`;
      } catch (error) {
        throw new Error(`Failed to get title: ${error.message}`);
      }
    },

    moveto: async (index) => {
      try {
        if (!index || isNaN(index)) {
          return 'Usage: moveto <index>';
        }
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.tabs.move(tab.id, {index: parseInt(index)});
        return `Tab moved to index ${index}`;
      } catch (error) {
        throw new Error(`Failed to move tab: ${error.message}`);
      }
    },

    count: async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const windows = await chrome.windows.getAll();
        return `Total tabs: ${tabs.length} (across ${windows.length} windows)`;
      } catch (error) {
        throw new Error(`Failed to count tabs: ${error.message}`);
      }
    },

    zoom: async (level) => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (level) {
          const zoomFactor = parseFloat(level) / 100;
          await chrome.tabs.setZoom(tab.id, zoomFactor);
          return `Zoom level set to ${level}%`;
        } else {
          const currentZoom = await chrome.tabs.getZoom(tab.id);
          return `Current zoom level: ${Math.round(currentZoom * 100)}%`;
        }
      } catch (error) {
        throw new Error(`Failed to get/set zoom: ${error.message}`);
      }
    },

    translate: async (lang = 'en') => {
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(tab.url)}`;
        await chrome.tabs.create({url: translateUrl});
        return `Page opened in Google Translate (target language: ${lang})`;
      } catch (error) {
        throw new Error(`Failed to translate page: ${error.message}`);
      }
    },

    shortcuts: () => {
      return `Terminal Keyboard Shortcuts:
- Tab: Complete tab names for 'cd' command
- Enter: Execute command
- Up Arrow: Navigate command history (previous command)
- Down Arrow: Navigate command history (next command)
- Click anywhere in terminal: Focus on command input`;
    },

    // Basic alias functionality
    alias: async (name, ...commandParts) => {
      try {
        if (!name || commandParts.length === 0) {
          return 'Usage: alias <name> <command>';
        }
        
        const aliasCommand = commandParts.join(' ');
        
        // Store alias in local storage
        const aliases = await new Promise((resolve) => {
          chrome.storage.local.get(['aliases'], (items) => {
            resolve(items.aliases || {});
          });
        });
        
        aliases[name] = aliasCommand;
        
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({aliases}, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        
        return `Alias created: ${name} -> ${aliasCommand}`;
      } catch (error) {
        throw new Error(`Failed to create alias: ${error.message}`);
      }
    }
  };

  async function handleCommand(input) {
    if (!input.trim()) return;
    
    try {
      let [command, ...args] = input.trim().split(' ');
      
      // Check for aliases
      const aliases = await new Promise((resolve) => {
        chrome.storage.local.get(['aliases'], (items) => {
          resolve(items.aliases || {});
        });
      });
      
      if (aliases[command]) {
        const aliasedCommand = aliases[command].split(' ');
        command = aliasedCommand[0];
        args = [...aliasedCommand.slice(1), ...args];
      }
      
      commandHistory.push(input);
      historyIndex = commandHistory.length;
      await saveToStorage('commandHistory', commandHistory);
      
      appendToTerminal(input, 'command');
      
      if (command === 'search') {
        const searchQuery = args.join(' ');
        const output = await commands.search(searchQuery);
        if (output) appendToTerminal(output, 'success');
        return;
      }
      
      if (commands[command]) {
        const output = await commands[command](...args);
        if (output) appendToTerminal(output, command === 'history' || command === 'bookmarks' || command === 'downloads' || command === 'extensions' ? 'history' : 'success');
      } else {
        appendToTerminal(`bash: command not found: ${command}`, 'error');
      }
    } catch (error) {
      appendToTerminal(`Error: ${error.message}`, 'error');
    }

    resetTabCompletion();
  }

  terminalContainer.addEventListener('click', function(e) {
    if (e.target !== commandInput) {
      commandInput.focus();
    }
  });

  commandInput.addEventListener('keydown', async function(event) {
    try {
      switch(event.key) {
        case 'Tab':
          event.preventDefault();
          await handleTabCompletion();
          break;

        case 'Enter':
          const command = commandInput.value;
          commandInput.value = '';
          await handleCommand(command);
          resetTabCompletion();
          break;
        
        case 'ArrowUp':
          event.preventDefault();
          if (historyIndex > 0) {
            historyIndex--;
            commandInput.value = commandHistory[historyIndex];
          }
          resetTabCompletion();
          break;
        
        case 'ArrowDown':
          event.preventDefault();
          if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            commandInput.value = commandHistory[historyIndex];
          } else {
            historyIndex = commandHistory.length;
            commandInput.value = '';
          }
          resetTabCompletion();
          break;

        default:
          if (event.key.length === 1) {
            resetTabCompletion();
          }
          break;
      }
    } catch (error) {
      // console.error('Command input error:', error);
      appendToTerminal(`Error processing input: ${error.message}`, 'error');
    }
  });

  commandInput.focus();
  initializeStorage();
});