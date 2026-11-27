// Comprehensive zh-CN dictionary for live DOM localization of Antigravity 2.0 UI.
// Base entries supplemented with upstream dictionaries from Silas-02/antigravity-desktop-cn (i18n_upstream.json).
// Applied strictly to UI chrome (never to conversation replies, user prompts, or code blocks).
import { readFileSync } from 'node:fs';

const MAX_I18N_LEN = 700;

export function normalizeUiText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

let UPSTREAM_ZH_EXACT = {};
try {
  UPSTREAM_ZH_EXACT = JSON.parse(readFileSync(new URL('./i18n_upstream.json', import.meta.url), 'utf8'));
} catch {
  UPSTREAM_ZH_EXACT = {};
}

const LOCAL_ZH_EXACT = {
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
  'Auto': '自动',
  'Turbo': '极速',
  'Request Review': '请求审查',
  'Local Permissions': '本地权限',
  'This Conversation': '当前会话',
  'This conversation': '当前会话',
  'Only this conversation uses this preset.': '仅当前会话使用此预设.',
  'Your This Computer setting': '你的“此计算机”设置',
  'Workspace Name': '工作区名称',
  'Worktree Name': '工作树名称',
  'Replace With New': '替换为新会话',
  'Remove From Split': '从拆分中移除',
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

export const ZH_EXACT = {
  ...UPSTREAM_ZH_EXACT,
  ...LOCAL_ZH_EXACT,
};

const ZH_LOWER = Object.create(null);
for (const [k, v] of Object.entries(ZH_EXACT)) {
  const lk = k.toLowerCase();
  if (!(lk in ZH_LOWER)) ZH_LOWER[lk] = v;
}

export const ZH_PATTERNS = [
  // Core AGY Beautify patterns
  ['^Worked for (.+)$', '已工作 $1'],
  ['^Your (.+) setting$', '你的“$1”设置'],
  ['^Thought for (.+)$', '已思考 $1'],
  ['^(\\d+) files? changed$', '已变更 $1 个文件'],
  ['^(\\d+)/(\\d+) steps$', '$1/$2 步骤'],
  ['^(\\d+)m ago$', '$1 分钟前'],
  ['^(\\d+)h ago$', '$1 小时前'],
  ['^(\\d+)d ago$', '$1 天前'],
  ['^Just now$', '刚刚', 'i'],
  ['^Review (\\d+) files?$', '审查 $1 个文件'],

  // Relative time & triggers (ported from Silas-02/antigravity-desktop-cn)
  ['^(\\d+)\\s*(?:s|sec|secs|second|seconds)\\s+ago$', '$1 秒前', 'i'],
  ['^(\\d+)\\s*(?:min|mins|minute|minutes)\\s+ago$', '$1 分钟前', 'i'],
  ['^(\\d+)\\s*(?:hr|hrs|hour|hours)\\s+ago$', '$1 小时前', 'i'],
  ['^(\\d+)\\s*(?:day|days)\\s+ago$', '$1 天前', 'i'],
  ['^(\\d+)\\s*(?:w|wk|wks|week|weeks)\\s+ago$', '$1 周前', 'i'],
  ['^(\\d+)\\s*(?:mo|mos|month|months)\\s+ago$', '$1 个月前', 'i'],
  ['^(\\d+)\\s*(?:y|yr|yrs|year|years)\\s+ago$', '$1 年前', 'i'],
  ['^Triggered\\s+(.+)$', '已触发 $1', 'i'],

  // Compact counts & lists
  ['^(\\d+)\\s+results?$', '$1 个结果', 'i'],
  ['^Comments?\\s*[（(]\\s*(\\d+)\\s*[)）]$', '评论（$1）', 'i'],
  ['^(\\d+)\\s+Comments?$', '$1 条评论', 'i'],
  ['^(\\d+)\\s+tools?$', '$1 个工具', 'i'],
  ['^(\\d+)\\s+on for this conversation$', '$1 个已为此会话开启', 'i'],
  ['^Side Questions?\\s*[（(]\\s*(\\d+)\\s*[)）]$', '侧边提问（$1）', 'i'],
  ['^(\\d+)\\s+Side Questions?$', '$1 个侧边提问', 'i'],
  ['^View\\s+(\\d+)\\s+side questions?$', '查看 $1 个侧边提问', 'i'],
  ['^[（(]\\s*(\\d+)\\s*subagents?\\s*[)）]$', '（$1 个子智能体）', 'i'],
  ['^See all\\s*[（(]\\s*(\\d+)\\s*[)）]$', '显示全部 ($1)', 'i'],
  ['^Send all\\s*[（(]\\s*(\\d+)\\s*[)）]$', '全部发送 ($1)', 'i'],
  ['^See\\s+(\\d+)\\s+more plugins$', '查看另外 $1 个插件', 'i'],
  ['^See\\s+(\\d+)\\s+more$', '查看另外 $1 项', 'i'],
  ['^(\\d+)\\s+accounts?$', '$1 个账号', 'i'],
  ['^Show submitted\\s*[（(]\\s*(\\d+)\\s*[)）]$', '显示已提交 ($1)', 'i'],
  ['^Show more\\s*[（(]\\s*(\\d+)\\s*[)）]$', '显示更多 ($1)', 'i'],
  ['^(\\+?)\\s*(\\d+)\\s+more lines?$', '$1$2 行代码', 'i'],
  ['^(\\d+)\\s+hidden hosts?$', '$1 个已隐藏主机', 'i'],
  ['^(\\d+)\\s+conversations?$', '$1 个对话', 'i'],
  ['^Marked\\s+(\\d+)\\s+conversations?\\s+as\\s+read[.。]?$', '已将 $1 个会话标记为已读', 'i'],
  ['^Marked\\s+(\\d+)\\s+conversations?\\s+as\\s+unread[.。]?$', '已将 $1 个会话标记为未读', 'i'],

  // Execution & live status
  ['^Stopped after\\s+(.+)$', '在 $1 后停止', 'i'],
  ['^Working(?:\\s*\\.{1,3}|\\s*…)$', '处理中...', 'i'],
  ['^Compacting(?:\\s*\\.{1,3}|\\s*…)$', '正在压缩...', 'i'],
  ['^Searching(?:\\s*\\.{1,3}|\\s*…)$', '正在搜索...', 'i'],

  // Version control / Git UI
  ['^All changes since (\\S+)$', '自 $1 以来的所有更改', 'i'],
  ['^Publish (\\S+) to origin$', '将 $1 发布到 origin', 'i'],
  ['^Push\\s+(\\d+)\\s+commits?\\s+to\\s+((?:↗\\s*)?\\S+)$', '将 $1 个提交推送到 $2', 'i'],
  ['^Pushed\\s+(\\d+)\\s+commits?\\s+to\\s+((?:↗\\s*)?\\S+)[.。]?$', '已将 $1 个提交推送到 $2', 'i'],
  ['^Committed\\s+to\\s+((?:↗\\s*)?\\S+)[.。]?$', '已提交到 $1', 'i'],
  ['^Amended\\s+commit\\s+on\\s+((?:↗\\s*)?[^\\s.。]+)[.。]?$', '已在 $1 上修补提交', 'i'],
  ['^Commit\\s+(\\d+)\\s+files?\\s+changes?\\s+to\\s+((?:↗\\s*)?\\S+)$', '将 $1 个文件的更改提交到 $2', 'i'],
  ['^Repo\\s+default\\s*[（(](.+?)[)）]$', '仓库默认 ($1)', 'i'],

  // Quotas & limits
  ['^(\\d+(?:\\.\\d+)?%)\\s+left$', '$1 剩余', 'i'],
  ['^Refreshes in (\\d+) days?, (\\d+) hours?$', '$1 天 $2 小时后刷新', 'i'],
  ['^Refreshes in (\\d+) hours?, (\\d+) minutes?$', '$1 小时 $2 分钟后刷新', 'i'],
  ['^Refreshes in (\\d+) days?$', '$1 天后刷新', 'i'],
  ['^Refreshes in (\\d+) hours?$', '$1 小时后刷新', 'i'],
  ['^Refreshes in (\\d+) minutes?$', '$1 分钟后刷新', 'i'],
  ['^Resets in <\\s*1m$', '不足 1 分钟后重置', 'i'],
  ['^Resets in (\\d+)\\s*(?:d|days?),?\\s*(\\d+)\\s*(?:h|hours?)$', '$1 天 $2 小时后重置', 'i'],
  ['^Resets in (\\d+)\\s*(?:h|hours?),?\\s*(\\d+)\\s*(?:m|mins?|minutes?)$', '$1 小时 $2 分钟后重置', 'i'],
  ['^Resets in (\\d+)\\s*(?:d|days?)$', '$1 天后重置', 'i'],
  ['^Resets in (\\d+)\\s*(?:h|hours?)$', '$1 小时后重置', 'i'],
  ['^Resets in (\\d+)\\s*(?:m|mins?|minutes?)$', '$1 分钟后重置', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in (\\d+) days?, (\\d+) hours?\\.?$', '您已使用部分每周配额，将在 $1 天 $2 小时后完全刷新。', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in (\\d+) hours?, (\\d+) minutes?\\.?$', '您已使用部分每周配额，将在 $1 小时 $2 分钟后完全刷新。', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in (\\d+) days?\\.?$', '您已使用部分每周配额，将在 $1 天后完全刷新。', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in (\\d+) hours?\\.?$', '您已使用部分每周配额，将在 $1 小时后完全刷新。', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in (\\d+) minutes?\\.?$', '您已使用部分每周配额，将在 $1 分钟后完全刷新。', 'i'],
  ['^You have used some of your weekly limit, it will fully refresh in less than a minute\\.?$', '您已使用部分每周配额，将在不到 1 分钟后完全刷新。', 'i'],
  ['^You have used some of your 5-hour limit, it will fully refresh in (\\d+) days?, (\\d+) hours?\\.?$', '您已使用部分 5 小时配额，将在 $1 天 $2 小时后完全刷新。', 'i'],
  ['^You have used some of your 5-hour limit, it will fully refresh in (\\d+) hours?, (\\d+) minutes?\\.?$', '您已使用部分 5 小时配额，将在 $1 小时 $2 分钟后完全刷新。', 'i'],
  ['^You have used some of your 5-hour limit, it will fully refresh in (\\d+) hours?\\.?$', '您已使用部分 5 小时配额，将在 $1 小时后完全刷新。', 'i'],
  ['^You have used some of your 5-hour limit, it will fully refresh in (\\d+) minutes?\\.?$', '您已使用部分 5 小时配额，将在 $1 分钟后完全刷新。', 'i'],
  ['^You have used some of your 5-hour limit, it will fully refresh in less than a minute\\.?$', '您已使用部分 5 小时配额，将在不到 1 分钟后完全刷新。', 'i'],
  ['^Your 5-hour limit will refresh in (\\d+) days?, (\\d+) hours?\\.?$', '您的 5 小时配额将在 $1 天 $2 小时后刷新。', 'i'],
  ['^Your 5-hour limit will refresh in (\\d+) hours?, (\\d+) minutes?\\.?$', '您的 5 小时配额将在 $1 小时 $2 分钟后刷新。', 'i'],
  ['^Your 5-hour limit will refresh in (\\d+) days?\\.?$', '您的 5 小时配额将在 $1 天后刷新。', 'i'],
  ['^Your 5-hour limit will refresh in (\\d+) hours?\\.?$', '您的 5 小时配额将在 $1 小时后刷新。', 'i'],
  ['^Your 5-hour limit will refresh in (\\d+) minutes?\\.?$', '您的 5 小时配额将在 $1 分钟后刷新。', 'i'],
  ['^Your 5-hour limit will refresh in less than a minute\\.?$', '您的 5 小时配额将在不到 1 分钟后刷新。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in (\\d+) days?, (\\d+) hours?\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在 $1 天 $2 小时后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in (\\d+) hours?, (\\d+) minutes?\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在 $1 小时 $2 分钟后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in (\\d+) days?\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在 $1 天后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in (\\d+) hours?\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在 $1 小时后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in (\\d+) minutes?\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在 $1 分钟后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your 5-hour limit, it will refresh in less than a minute\\. If on a supported paid plan, you can use AI credits in the interim\\.?$', '您已达到 5 小时配额限制，将在不到 1 分钟后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in (\\d+) days?, (\\d+) hours?\\.?$', '您已达到每周配额限制，将在 $1 天 $2 小时后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in (\\d+) hours?, (\\d+) minutes?\\.?$', '您已达到每周配额限制，将在 $1 小时 $2 分钟后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in (\\d+) days?\\.?$', '您已达到每周配额限制，将在 $1 天后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in (\\d+) hours?\\.?$', '您已达到每周配额限制，将在 $1 小时后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in (\\d+) minutes?\\.?$', '您已达到每周配额限制，将在 $1 分钟后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it will fully refresh in less than a minute\\.?$', '您已达到每周配额限制，将在不到 1 分钟后完全刷新。', 'i'],
  ['^You have hit your weekly limit, it refreshes in (.+?)\\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\\.?$', '您已达到每周配额限制，将在 $1 后刷新。如果使用的是受支持的付费计划，您可以在此期间使用 AI 额度，或升级到更高等级的套餐。', 'i'],
  ['^You have hit your weekly limit, the 5-hour limit does not currently apply\\. Your weekly limit will fully refresh in (.+?)\\.?$', '您已达到每周配额限制，因此当前不适用 5 小时配额限制。您的每周配额将在 $1 后完全刷新。', 'i'],
  ["^Your plan(?:'s|’s) baseline quota will refresh on\\s+(.+?)[.。]$", '您当前计划的基础配额将于 $1 刷新。', 'i'],
  ['^Weekly\\s+limit,\\s*resets\\s+in\\s+(.+?)\\.?$', '每周配额限制，$1 后重置', 'i'],
  ['^Weekly\\s+limit,\\s*refreshes\\s+in\\s+(.+?)\\.?$', '每周配额限制，$1 后刷新', 'i'],
  ['^(?:5-hour|Five Hour|5h)\\s+limit,\\s*resets\\s+in\\s+(.+?)\\.?$', '5 小时配额限制，$1 后重置', 'i'],
  ['^(?:5-hour|Five Hour|5h)\\s+limit,\\s*refreshes\\s+in\\s+(.+?)\\.?$', '5 小时配额限制，$1 后刷新', 'i'],
  ['^Your\\s+Weekly Limit(:?)$', '您的每周配额限制$1', 'i'],
  ['^Your\\s+Weekly Limit Remaining(:?)$', '您的每周配额剩余$1', 'i'],
  ['^Your\\s+(?:5-Hour|Five Hour|5h)\\s+Limit(:?)$', '您的 5 小时配额限制$1', 'i'],
  ['^Your\\s+(?:5-Hour|Five Hour|5h)\\s+Limit Remaining(:?)$', '您的 5 小时配额剩余$1', 'i'],
  ['^(.+?)\\s+Weekly Limit(:?)$', '$1 每周配额限制$2', 'i'],
  ['^(.+?)\\s+Weekly Limit Remaining(:?)$', '$1 每周配额剩余$2', 'i'],
  ['^(.+?)\\s+(?:5-Hour|Five Hour|5h)\\s+Limit(:?)$', '$1 5 小时配额限制$2', 'i'],
  ['^(.+?)\\s+(?:5-Hour|Five Hour|5h)\\s+Limit Remaining(:?)$', '$1 5 小时配额剩余$2', 'i'],
  ['^Models within this group:\\s*(.+)$', '此组内的模型：$1', 'i'],
  ["^When toggled on,\\s+(.+?)\\s+will use your AI credits to fulfill model requests once you're out of model quota\\.\\s+\\1\\s+will always use your model quota first before using AI credits\\.?$", '启用后，当模型配额用尽时，$1 将使用您的 AI 额度处理模型请求。系统会优先使用模型配额，之后才使用 AI 额度。', 'i'],
  ['^When toggled on,\\s+(.+?)\\s+collects usage data to help Google enhance performance and features\\.?$', '启用后，$1 会收集使用数据，以帮助 Google 改进性能和功能。', 'i'],

  // Permissions & approvals
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, and always allow '(.+)' in this project$", "是，且在此项目中始终允许运行 '$1'", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, and always allow '(.+)' when not in a project$", "是，且在不属于任何项目时始终允许运行 '$1'", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, and always allow '(.+)' in this workspace$", "是，且在此工作区中始终允许运行 '$1'", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, and always allow '(.+)' in this conversation$", "是，且在此会话中始终允许运行 '$1'", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, and always allow '(.+)'$", "是，且始终允许运行 '$1'", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)' in this project$", "是，在此项目中为 '$1' 保存规则", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)' when not in a project$", "是，在不属于任何项目时为 '$1' 保存规则", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)' in this workspace$", "是，在此工作区中为 '$1' 保存规则", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)' in this conversation$", "是，在此会话中为 '$1' 保存规则", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)' globally$", "是，全局为 '$1' 保存规则", 'i'],
  ["^(?:(?:\\[\\d+\\]|\\d+[.):]?)\\s+)?Yes, save rule for '(.+)'$", "是，为 '$1' 保存规则", 'i'],
  ['^Allow read access to this path\\??$', '是否允许读取此路径？', 'i'],
  ['^Allow write access to this path\\??$', '是否允许写入此路径？', 'i'],
  ['^Allow reading this url\\??$', '是否允许读取此 URL？', 'i'],
  ['^Allow executing actions on this url\\??$', '是否允许在此 URL 上执行操作？', 'i'],
  ['^Allow running this command\\??$', '是否允许运行此命令？', 'i'],
  ['^Allow running this command outside the sandbox\\??$', '是否允许在沙箱外运行此命令？', 'i'],
  ['^Allow using this mcp tool\\??$', '是否允许使用此 MCP 工具？', 'i'],
  ['^Allow a one-time administrator \\(uac\\) elevation\\??$', '是否允许单次管理员 (UAC) 提权？', 'i'],
  ['^Allow access to this resource\\??$', '是否允许访问此资源？', 'i'],

  // Automations & schedules
  ['^Next\\s+run\\s+today\\s+(?:around|at)\\s+(.+)$', '下次运行：今天约 $1', 'i'],
  ['^Next\\s+run\\s+tomorrow\\s+(?:around|at)\\s+(.+)$', '下次运行：明天约 $1', 'i'],
  ['^Next\\s+run\\s+(?:around|at)\\s+(.+)$', '下次运行：约 $1', 'i'],
  ['^Next\\s+run\\s+(.+)$', '下次运行：$1', 'i'],
  ['^Last\\s+run\\s+(?:today\\s+around|today\\s+at)\\s+(.+)$', '上次运行：今天约 $1', 'i'],
  ['^Last\\s+run\\s+(?:around|at)\\s+(.+)$', '上次运行：约 $1', 'i'],
  ['^Last\\s+run\\s+(.+)$', '上次运行：$1', 'i'],
  ['^Every\\s+(\\d+)\\s+(?:minutes?|mins?)$', '每 $1 分钟', 'i'],
  ['^Every\\s+(\\d+)\\s+(?:hours?|hrs?)$', '每 $1 小时', 'i'],
  ['^Every\\s+(\\d+)\\s+days?$', '每 $1 天', 'i'],
  ['^Every\\s+(\\d+)\\s+weeks?$', '每 $1 周', 'i'],
  ['^Every\\s+(\\d+)\\s+months?$', '每 $1 个月', 'i'],
  ['^Every\\s+minute$', '每分钟', 'i'],
  ['^Every\\s+hour$', '每小时', 'i'],
  ['^Every\\s+day$', '每天', 'i'],
  ['^Every\\s+week$', '每周', 'i'],
  ['^Every\\s+month$', '每月', 'i'],
  ['^(?:Every\\s+day|Everyday)\\s+(?:around|at)\\s+(.+)$', '每天在 $1', 'i'],
  ['^Weekdays\\s+(?:around|at)\\s+(.+)$', '每个工作日在 $1', 'i'],
  ['^Weekends\\s+(?:around|at)\\s+(.+)$', '每周末在 $1', 'i'],
  ['^Daily\\s+(?:around|at)\\s+(.+)$', '每天在 $1', 'i'],
  ['^Weekly\\s+(?:around|at)\\s+(.+)$', '每周在 $1', 'i'],
  ['^Monthly\\s+(?:around|at)\\s+(.+)$', '每月在 $1', 'i'],
  ['^Managed by the\\s+(.+?)\\s+automation$', '由 $1 自动化管理', 'i'],
  ['^Created\\s+automation\\s+["“](.+?)["”][.。]?$', '已创建自动化“$1”', 'i'],
  ['^Created\\s+scheduled task\\s+["“](.+?)["”][.。]?$', '已创建计划任务“$1”', 'i'],
  ['^Started\\s+["“](.+?)["”][.。]?$', '已启动“$1”', 'i'],
  ['^Restarted\\s+["“](.+?)["”][.。]?$', '已重启“$1”', 'i'],
  ['^Enabled\\s+["“](.+?)["”][.。]?$', '已启用“$1”', 'i'],
  ['^Disabled\\s+["“](.+?)["”][.。]?$', '已禁用“$1”', 'i'],
  ['^Deleted\\s+["“](.+?)["”][.。]?$', '已删除“$1”', 'i'],
  ['^Failed to start\\s+["“](.+?)["”][.。]?$', '启动“$1”失败', 'i'],
  ['^Failed to update\\s+["“](.+?)["”][.。]?$', '更新“$1”失败', 'i'],
  ['^Failed to save\\s+["“](.+?)["”][.。]?$', '保存“$1”失败', 'i'],
  ['^Failed to delete\\s+["“](.+?)["”][.。]?$', '删除“$1”失败', 'i'],

  // Misc UI chrome
  ['^Hi\\s+(.+?),\\s+what can we get done today\\?$', '嗨 $1，今天我们可以完成些什么？', 'i'],
  ['^Your\\s+Plan:\\s*(.+)$', '您的计划: $1', 'i'],
  ['^Build with\\s+(.+?)\\s+Plugins$', '使用 $1 插件构建', 'i'],
  ['^Gemini\\s+(.+?)\\s+is now available$', 'Gemini $1 现已可用', 'i'],
  ['^Error ID:\\s*(.+)$', '错误 ID: $1', 'i'],
  ['^Executor is not currently running \\(error ID:\\s*(.+)\\)$', '执行器当前未运行 (错误 ID: $1)', 'i'],
  ['^(\\d+) tools? enabled$', '$1 个工具已启用', 'i'],
  ['^(\\d+) active conversations?$', '$1 个活跃会话', 'i'],
  ['^(\\d+) archived conversations?$', '$1 个已归档会话', 'i'],
  ['^(\\d+) tasks? running$', '$1 个任务正在运行', 'i'],
  ['^(\\d+)\\s+subagents?\\s+running$', '$1 个子智能体运行中', 'i'],
  ['^(\\d+)\\s+subagents?\\s+blocked$', '$1 个子智能体等待中', 'i'],
  ['^(\\d+)\\s+subagents?\\s+completed$', '$1 个子智能体已完成', 'i'],
  ['^(\\d+)\\s+subagents?\\s+failed$', '$1 个子智能体失败', 'i'],
  ['^Domains:\\s+(.+)$', '域名：$1', 'i'],
  ['^Scopes:\\s+(.+)$', '权限范围：$1', 'i'],
  ['^Secret for a new\\s+(.+?)\\s+account$', '用于新 $1 账号的密钥', 'i'],
  ['^Secret for\\s+(.+)$', '用于 $1 的密钥', 'i'],
  ['^Setting up WSL:\\s*(.+)$', '正在设置 WSL: $1', 'i'],
  ['^Voice\\s+speed,\\s*([0-9.]+x)$', '语速，$1', 'i'],
  ['^File exceeds the (\\d+(?:\\.\\d+)?\\s*(?:[KMGTP]?B|bytes?))\\s+display limit\\.?$', '文件超过 $1 显示限制', 'i'],
  ['^Uses\\s+your\\s+local\\s+clone,\\s*(.+)$', '使用您的本地克隆，$1', 'i'],
];

const COMPILED_PATTERNS = ZH_PATTERNS.map(([pat, rep, flags]) => [new RegExp(pat, flags || ''), rep]);

function lookupExact(norm) {
  if (Object.prototype.hasOwnProperty.call(ZH_EXACT, norm)) return ZH_EXACT[norm];
  if (norm.length >= 5) {
    const lk = norm.toLowerCase();
    if (lk in ZH_LOWER) return ZH_LOWER[lk];
  }
  return null;
}

function translateShortcutSuffix(norm) {
  let m = norm.match(/^(.+?)\s*\((Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?([^)]*)\)$/i);
  if (m) {
    const t = lookupExact(normalizeUiText(m[1]));
    if (t) return `${t} (${m[2]}${m[3] ? '+' + m[3] : ''})`;
  }
  m = norm.match(/^(.+?)\s+((?:(?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+)+[A-Za-z0-9;,./-]+)$/i);
  if (m) {
    const t = lookupExact(normalizeUiText(m[1]));
    if (t) return `${t} ${m[2]}`;
  }
  return null;
}

export function translateUiText(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_I18N_LEN) return null;
  const norm = normalizeUiText(trimmed);
  if (!norm) return null;
  const exact = lookupExact(norm);
  if (exact !== null) return raw.replace(trimmed, exact);
  const shortcut = translateShortcutSuffix(norm);
  if (shortcut !== null) return raw.replace(trimmed, shortcut);
  for (const [re, rep] of COMPILED_PATTERNS) {
    if (re.test(norm)) {
      return raw.replace(trimmed, norm.replace(re, rep));
    }
  }
  return null;
}
