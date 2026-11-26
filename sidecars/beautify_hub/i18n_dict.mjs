// Comprehensive zh-CN dictionary for live DOM localization of Antigravity 2.0 UI.
// Applied strictly to UI chrome (never to conversation replies, user prompts, or code blocks).

export const ZH_EXACT = {
  // Sidebar & Navigation
  'New Conversation': '新建对话',
  'New conversation': '新建对话',
  'Automations': '自动化任务',
  'Scheduled Tasks': '定时任务',
  'Customizations': '自定义',
  'Plugins': '插件',
  'Skills': '技能',
  'Rules': '规则',
  'Hooks': '钩子',
  'MCP Servers': 'MCP 服务',
  'Settings': '设置',
  'Projects': '项目',
  'Outside of Project': '项目外',
  'Search': '搜索',
  'Search conversations': '搜索对话',
  'Add Project': '添加项目',
  'Open Folder': '打开文件夹',
  'Archive': '归档',
  'Unarchive': '取消归档',
  'Pin': '置顶',
  'Unpin': '取消置顶',
  'Rename': '重命名',
  'Delete': '删除',
  'Fork': '分支对话',
  'Load older messages': '加载更早的消息',

  // Overview & Aux Pane
  'Review': '变更审查',
  'Files': '文件',
  'Terminal': '终端',
  'Preview': '预览',
  'Artifacts': '产物',
  'Extensions': '扩展面板',
  'Customize Sections': '自定义分区',
  'Filter files...': '筛选文件...',
  'Clear filter': '清除筛选',
  'Toggle Overview Panel': '切换概览面板',
  'More actions': '更多操作',

  // Composer, Permissions & Model Controls
  'Ask anything, @ to mention, / for actions': '输入任意问题，@ 引用文件，/ 触发指令',
  'Queued Messages': '排队消息',
  'Sends after agent finishes working': '当前任务完成后自动发送',
  'Ask every time': '每次询问',
  'Always proceed': '始终自动执行',
  'Request review': '请求审查',
  'Proceed in sandbox': '沙盒内执行',
  'Strict': '严格模式',
  'Default': '默认',
  'Permissions': '权限',
  'Model': '模型',
  'Voice': '语音',
  'Send': '发送',
  'Stop': '停止',
  'Cancel': '取消',
  'Proceed': '继续执行',
  'Accept': '接受',
  'Accept all': '全部接受',
  'Reject': '拒绝',
  'Reject all': '全部拒绝',
  'Approve': '批准',
  'Deny': '拒绝',
  'Allow': '允许',
  'Allow once': '仅允许一次',
  'Always allow': '始终允许',
  'Waiting for your approval': '等待你的确认',

  // Actions & Toolbars
  'Copy': '复制',
  'Copied': '已复制',
  'Copied to clipboard': '已复制到剪贴板',
  'Cut': '剪切',
  'Paste': '粘贴',
  'Undo to this point': '回退到此处',
  'Edit': '编辑',
  'Save': '保存',
  'Close': '关闭',
  'Done': '完成',
  'Reset': '重置',
  'Refresh': '刷新',
  'Enable': '启用',
  'Disable': '停用',
  'Enabled': '已启用',
  'Disabled': '已停用',
  'Install': '安装',
  'Uninstall': '卸载',
  'Installed': '已安装',
  'Update': '更新',
  'Open in Side Panel': '在侧边栏打开',
  'Open in External Browser': '在外部浏览器打开',
  'Show in File Explorer': '在文件资源管理器中显示',
  'Reveal in Finder': '在访达中显示',

  // Settings Panel Headings & Items
  'General': '常规',
  'Appearance': '外观',
  'Theme': '主题',
  'Light': '浅色',
  'Dark': '深色',
  'System': '跟随系统',
  'Account': '账号',
  'Usage': '用量',
  'Notifications': '通知',
  'Shortcuts': '快捷键',
  'Keybindings': '快捷键',
  'Terminal Sandbox': '终端沙盒',
  'Tool Execution Policy': '工具执行策略',
  'Non-Workspace File Access': '非工作区文件访问',
  'Internet Access Policy': '网络访问策略',
  'Permission Grants': '权限授予',
  'Conversation Width': '对话宽度',
  'Input Box': '输入框',
  'Choose which key sends a message in the chat composer.': '选择在对话框中发送消息的快捷键。',
  'Check for Updates': '检查更新',
  'Sign out': '退出登录',

  // Status & Misc
  'Working': '处理中',
  'Thinking': '思考中',
  'Thought': '思考过程',
  'Running': '运行中',
  'Completed': '已完成',
  'Failed': '失败',
  'Queued': '排队中',
  'Show plan': '查看步骤计划',
  'Hide plan': '收起步骤计划',
  'No results': '无结果',
  'Loading...': '加载中...',
};

export const ZH_PATTERNS = [
  ['^Worked for (.+)$', '已工作 $1'],
  ['^Thought for (.+)$', '已思考 $1'],
  ['^(\\d+) files? changed$', '已变更 $1 个文件'],
  ['^(\\d+)/(\\d+) steps$', '$1/$2 步骤'],
  ['^(\\d+)m ago$', '$1 分钟前'],
  ['^(\\d+)h ago$', '$1 小时前'],
  ['^(\\d+)d ago$', '$1 天前'],
  ['^Just now$', '刚刚'],
  ['^Review (\\d+) files?$', '审查 $1 个文件'],
];

export function translateUiText(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 90) return null;
  if (Object.prototype.hasOwnProperty.call(ZH_EXACT, trimmed)) {
    return raw.replace(trimmed, ZH_EXACT[trimmed]);
  }
  for (const [pat, rep] of ZH_PATTERNS) {
    const re = new RegExp(pat);
    if (re.test(trimmed)) {
      return raw.replace(trimmed, trimmed.replace(re, rep));
    }
  }
  return null;
}
