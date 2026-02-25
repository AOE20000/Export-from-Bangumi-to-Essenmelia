// Initialize state
const state = _state;
state.username = state.username || '';
state.defaultTags = state.defaultTags || '';
state.collectionList = state.collectionList || [];
state.loading = false;

// Cache for items to avoid proxy overhead
let cachedItems = [];
let cachedItemsMap = {};

function getStatusText(type) {
  switch (type) {
    case 1: return '想看';
    case 2: return '看过';
    case 3: return '在看';
    case 4: return '搁置';
    case 5: return '抛弃';
    default: return '未知';
  }
}

// Fetch collections from Bangumi API
async function fetchCollections() {
  if (state.loading) return;
  
  const username = state.username ? state.username.trim() : '';
  if (!username) {
    await essenmelia.showSnackBar('请输入用户名');
    return;
  }

  state.loading = true;
  // Show loading indicator
  state.collectionList = [{
    type: 'container',
    props: { height: 100, padding: 20 },
    children: [{
      type: 'text', 
      props: { text: '加载中...', textAlign: 'center' }
    }]
  }];

  try {
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let allItems = [];
    
    // Clear cache
    cachedItems = [];
    cachedItemsMap = {};

    // Initial progress
    await essenmelia.updateProgress(0, '开始获取收藏...');

    while (hasMore) {
        // Update UI to show progress
        const page = (offset / limit) + 1;
        const msg = `正在加载第 ${page} 页 (已获取 ${allItems.length} 条)...`;
        
        // Show indeterminate progress in notification bar
        essenmelia.updateProgress(-1, msg);

        state.collectionList = [{
            type: 'container',
            props: { height: 100, padding: 20 },
            children: [{
                type: 'text', 
                props: { text: `正在加载第 ${(offset / limit) + 1} 页 (已获取 ${allItems.length} 条)...`, textAlign: 'center' }
            }]
        }];
        
        const url = `https://api.bgm.tv/v0/users/${username}/collections?limit=${limit}&offset=${offset}`;
        console.log('Fetching collections from: ' + url);
        const resStr = await essenmelia.httpGet(url, {
            'User-Agent': 'Essenmelia/1.0 (https://github.com/Essenmelia/Essenmelia) BangumiCollection/1.0'
        });
        
        let res;
        if (typeof resStr === 'object') {
            res = resStr;
        } else {
            try {
                res = JSON.parse(resStr);
            } catch (e) {
                console.log('JSON parse error: ' + e);
                hasMore = false;
                break;
            }
        }
        
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            console.log('Got ' + res.data.length + ' items');
            allItems = allItems.concat(res.data);
            if (res.data.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
                // Removed delay to prevent potential event loop hanging
            }
        } else {
            console.log('No more items or invalid response');
            hasMore = false;
        }
    }
    
    if (allItems.length > 0) {
      await essenmelia.updateProgress(1.0, `获取完成，共 ${allItems.length} 条`);
      const items = allItems;
      cachedItems = items; // Cache items
      cachedItemsMap = {}; // Reset cache map
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.subject && item.subject.id) {
            cachedItemsMap[item.subject.id] = item;
        }
      }
      
      const newUiList = [];

      // Add "Import All" button at the top
      newUiList.push({
        type: 'row',
        props: {
            mainAxisAlignment: 'end',
            padding: [16, 8, 16, 8]
        },
        children: [{
            type: 'button',
            props: {
                label: '一键导入全部',
                icon: 0xe161, // save_alt
                variant: 'filled',
                onTap: 'importAll' 
            }
        }]
      });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const subject = item.subject || {};
        const images = subject.images || {};
        const cover = images.common || images.medium || images.large || '';
        const eps = subject.eps || 0;
        const watched = item.ep_status || 0;
        
        // Build UI component for each item
        const card = {
          type: 'card',
          props: {
            variant: 'filled',
            margin: [0, 0, 0, 12],
            padding: 0
          },
          children: [{
            type: 'row',
            props: {
              crossAxisAlignment: 'start'
            },
            children: [
              // Cover Image
              {
                type: 'image',
                props: {
                  url: cover,
                  width: 80,
                  height: 120,
                  fit: 'cover',
                  borderRadius: 12
                }
              },
              // Info Column
              {
                type: 'expanded',
                children: [{
                  type: 'column',
                  props: {
                    padding: [12, 8, 12, 8],
                    crossAxisAlignment: 'start'
                  },
                  children: [
                    // Title
                    {
                      type: 'text',
                      props: {
                        text: subject.name_cn || subject.name,
                        style: 'titleMedium',
                        maxLines: 1,
                        bold: true
                      }
                    },
                    // Subtitle (Original Name)
                    {
                      type: 'text',
                      props: {
                        text: subject.name,
                        style: 'bodySmall',
                        maxLines: 1,
                        textColor: 'outline'
                      }
                    },
                    // Summary (if available)
                    subject.short_summary ? {
                      type: 'text',
                      props: {
                        text: subject.short_summary,
                        style: 'bodySmall',
                        maxLines: 2,
                        textColor: 'onSurfaceVariant',
                        padding: [0, 4, 0, 4]
                      }
                    } : { type: 'sized_box', props: { height: 4 } },
                    // Status/Score Row
                    {
                      type: 'row',
                      props: {
                        padding: [0, 4, 0, 0]
                      },
                      children: [
                        // Status Badge
                        {
                          type: 'container',
                          props: {
                            color: 'secondaryContainer',
                            padding: [6, 2, 6, 2],
                            borderRadius: 4,
                            margin: [0, 8, 0, 0]
                          },
                          children: [{
                            type: 'text',
                            props: {
                              text: getStatusText(item.type),
                              style: 'labelSmall',
                              textColor: 'onSecondaryContainer'
                            }
                          }]
                        },
                        // User Rating
                        item.rate > 0 ? {
                          type: 'container',
                          props: {
                            color: 'primaryContainer',
                            padding: [6, 2, 6, 2],
                            borderRadius: 4,
                            margin: [0, 8, 0, 0]
                          },
                          children: [{
                            type: 'text',
                            props: {
                              text: '评分: ' + item.rate,
                              style: 'labelSmall',
                              textColor: 'onPrimaryContainer'
                            }
                          }]
                        } : { type: 'sized_box' },
                        // Global Score
                        {
                          type: 'container',
                          props: {
                            color: 'surfaceContainerHighest',
                            padding: [6, 2, 6, 2],
                            borderRadius: 4
                          },
                          children: [{
                            type: 'text',
                            props: {
                              text: '均分: ' + (subject.score || '-'),
                              style: 'labelSmall',
                              textColor: 'onSurfaceVariant'
                            }
                          }]
                        }
                      ]
                    },
                    // Add to Event Button
                    {
                        type: 'row',
                        props: {
                            mainAxisAlignment: 'end',
                            padding: [0, 8, 0, 0]
                        },
                        children: [{
                            type: 'button',
                            props: {
                                label: '导入日程',
                                icon: 0xe145, // add
                                variant: 'tonal',
                                onTap: 'addToEvent?title=' + encodeURIComponent(subject.name_cn || subject.name) + 
                                       '&originalTitle=' + encodeURIComponent(subject.name || '') +
                                       '&cover=' + encodeURIComponent(cover) +
                                       '&eps=' + eps + 
                                       '&watched=' + watched +
                                       '&summary=' + encodeURIComponent(subject.short_summary || '') +
                                       '&score=' + (subject.score || '0') +
                                       '&userScore=' + (item.rate || '0') +
                                       '&userComment=' + encodeURIComponent(item.comment || '') +
                                       '&userTags=' + encodeURIComponent((item.tags || []).join(',')) +
                                       '&collectionStatus=' + item.type +
                                       '&subjectId=' + (subject.id || '')
                            }
                        }]
                    }
                  ]
                }]
              }
            ]
          }]
        };
        newUiList.push(card);
      }
      
      state.collectionList = newUiList;
    } else {
      state.collectionList = [{
        type: 'text',
        props: { text: '未找到数据', textAlign: 'center', padding: 20 }
      }];
    }
  } catch (e) {
    console.log('Error fetching collections', e);
    await essenmelia.showSnackBar('加载失败: ' + e);
    state.collectionList = [{
      type: 'text',
      props: { text: '加载失败: ' + e, textColor: 'error', textAlign: 'center', padding: 20 }
    }];
  }

  state.loading = false;
}

function prepareEventData(args) {
  const title = args.title;
  const originalTitle = args.originalTitle || '';
  const cover = args.cover;
  const eps = parseInt(args.eps || '0');
  const watched = parseInt(args.watched || '0');
  const summary = args.summary || '';
  const score = args.score || '0';
  const userScore = args.userScore || '0';
  const userComment = args.userComment || '';
  const userTagsStr = args.userTags || '';
  const collectionStatusType = parseInt(args.collectionStatus || '0');
  const subjectId = args.subjectId || '';
  
  // Parse tags
  let tags = ['Bangumi', 'Anime'];
  
  // Add collection status tag
  const statusText = getStatusText(collectionStatusType);
  if (statusText !== '未知') {
      tags.push(statusText);
  }
  
  // Add user tags
  if (userTagsStr) {
      const userTags = userTagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
      // Limit to top 3 user tags to avoid clutter
      tags = tags.concat(userTags.slice(0, 3)); 
  }

  if (state.defaultTags) {
      const extraTags = state.defaultTags.split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0);
      tags = tags.concat(extraTags);
  }
  
  // Deduplicate tags
  tags = [...new Set(tags)];

  // Build description
  let description = '';
  if (originalTitle && originalTitle !== title) {
      description += `原名: ${originalTitle}\n`;
  }
  if (summary) {
      description += `简介: ${summary}\n\n`;
  }
  
  description += `Bangumi ID: ${subjectId}\n`;
  if (subjectId) {
      description += `Link: https://bgm.tv/subject/${subjectId}\n`;
  }
  
  if (score !== '0') description += `评分: ${score}\n`;
  if (userScore !== '0') description += `我的评分: ${userScore}\n`;
  if (userComment) description += `我的短评: ${userComment}\n`;
  
  description += `\nCover: ${cover}\nFrom Bangumi Collection Extension`;

  // Build steps
  const steps = [];
  
  // Logic to determine how many steps to generate
  let loopCount = eps;
  if (loopCount === 0 && watched > 0) {
      loopCount = watched; 
  }
  
  if (loopCount > 0) {
      for (let i = 1; i <= loopCount; i++) {
          steps.push({
              description: `第 ${i} 话`,
              completed: i <= watched,
              timestamp: new Date().toISOString()
          });
      }
      
      // If we don't know the total, add a generic "Next Episode" placeholder
      if (eps === 0) {
           steps.push({
              description: `第 ${loopCount + 1} 话 (后续未知)`,
              completed: false,
              timestamp: new Date().toISOString()
          });
      }
  } else if (watched > 0) {
      steps.push({
          description: `已看 ${watched} 话`,
          completed: true,
          timestamp: new Date().toISOString()
      });
  }

  return {
      title: title,
      description: description,
      tags: tags,
      imageUrl: cover,
      steps: steps,
      stepDisplayMode: 'number',
      stepSuffix: '话'
  };
}

async function addToEvent(args, silent) {
  // Try to use cached item first for better data completeness
  if (args.subjectId && cachedItemsMap && cachedItemsMap[args.subjectId]) {
      try {
          const item = cachedItemsMap[args.subjectId];
          const subject = item.subject || {};
          const images = subject.images || {};
          
          // Override args with full data from cache
          args.title = subject.name_cn || subject.name || args.title;
          args.originalTitle = subject.name || args.originalTitle;
          args.cover = images.common || images.medium || images.large || args.cover || '';
          args.eps = (subject.eps || 0).toString();
          args.watched = (item.ep_status || 0).toString();
          args.summary = subject.summary || subject.short_summary || args.summary || '';
          args.score = (subject.score || '0').toString();
          args.userScore = (item.rate || '0').toString();
          args.userComment = item.comment || args.userComment || '';
          args.userTags = (item.tags || []).join(',');
          args.collectionStatus = (item.type || 0).toString();
          
          console.log('Using cached data for import: ' + args.title);
      } catch (e) {
          console.log('Error using cached data: ' + e);
      }
  }

  const data = prepareEventData(args);

  try {
    await essenmelia.addEvent(data);
    if (!silent) await essenmelia.showSnackBar('已添加到日程: ' + data.title);
  } catch (e) {
    if (!silent) await essenmelia.showSnackBar('添加失败: ' + e);
    throw e;
  }
}

async function importAll() {
    if (!cachedItems || cachedItems.length === 0) {
        await essenmelia.showSnackBar('没有可导入的项目');
        return;
    }
    
    await essenmelia.showSnackBar('开始导入 ' + cachedItems.length + ' 个项目...');
    
    let successCount = 0;
    for (let i = 0; i < cachedItems.length; i++) {
        const item = cachedItems[i];
        const subject = item.subject || {};
        const images = subject.images || {};
        const cover = images.common || images.medium || images.large || '';
        const eps = subject.eps || 0;
        const watched = item.ep_status || 0;
        const title = subject.name_cn || subject.name;
        
        try {
            await addToEvent({
                title: title,
                originalTitle: subject.name,
                cover: cover,
                eps: eps,
                watched: watched,
                summary: subject.short_summary,
                score: subject.score,
                userScore: item.rate,
                userComment: item.comment,
                userTags: (item.tags || []).join(','),
                collectionStatus: item.type,
                subjectId: subject.id
            }, true); // silent mode
            successCount++;
        } catch (e) {
            console.log('Import failed for ' + title + ': ' + e);
        }
        
        // Show progress every 20 items
        if (i > 0 && i % 20 === 0) {
             await essenmelia.showSnackBar(`正在导入... (${i}/${cachedItems.length})`);
             // Yield to UI loop (no setTimeout as it may hang)
        }
    }
    
    await essenmelia.showSnackBar('导入完成: 成功 ' + successCount + '/' + cachedItems.length);
}

// Mark all steps as completed for events with "看过" tag
async function markWatchedAsDone() {
  if (state.loading) return;
  
  const confirm = await essenmelia.showConfirmDialog({
    title: '确认操作',
    message: '是否将所有包含“看过”标签的事件的所有步骤标记为已完成？此操作不可撤销。',
    confirmLabel: '确定',
    cancelLabel: '取消'
  });
  
  if (!confirm) return;

  state.loading = true;
  await essenmelia.showSnackBar('正在获取所有事件...');
  
  try {
    const events = await essenmelia.getEvents();
    console.log(`Fetched ${events.length} events`);
    
    const watchedEvents = events.filter(e => e.tags && e.tags.includes('看过'));
    console.log(`Found ${watchedEvents.length} watched events`);
    
    if (watchedEvents.length === 0) {
      await essenmelia.showSnackBar('未找到包含“看过”标签的事件');
      state.loading = false;
      return;
    }

    let count = 0;
    for (let i = 0; i < watchedEvents.length; i++) {
      const event = watchedEvents[i];
      // Optional: Show progress via snackbar periodically
      if (i % 5 === 0) {
         await essenmelia.showSnackBar(`正在处理: ${event.title} (${i+1}/${watchedEvents.length})`);
      }
      
      if (event.steps && event.steps.length > 0) {
        let modified = false;
        const newSteps = event.steps.map(step => {
           if (!step.completed) {
             modified = true;
             return { ...step, completed: true };
           }
           return step;
        });
        
        if (modified) {
          console.log(`Updating event ${event.id} steps`);
          // Note: updateEvent expects 'steps' to be a list of maps, 
          // and since we are in JS, passing array of objects works.
          // IMPORTANT: To avoid overwriting other fields (like description, tags, etc.) which might be handled by updateEvent implementation,
          // we should ideally pass all fields or rely on partial update support.
          // Currently, updateEvent in ExtensionApiImpl might reconstruct the event from provided params.
          // If we only pass 'steps', other fields might be set to null if the implementation doesn't handle partial updates correctly.
          // Let's check api_usage.md or implementation.
          // "updateEvent: 更新任务详情. { event: eventObject }" or "must include id".
          // If the implementation replaces the whole event, we must pass all fields.
          // Let's pass the full event object with updated steps to be safe.
          
          const updatedEvent = {
              id: event.id,
              title: event.title,
              description: event.description,
              tags: event.tags,
              imageUrl: event.imageUrl,
              stepDisplayMode: event.stepDisplayMode,
              stepSuffix: event.stepSuffix,
              reminderTime: event.reminderTime,
              reminderRecurrence: event.reminderRecurrence,
              reminderScheme: event.reminderScheme,
              steps: newSteps
          };
          
          await essenmelia.updateEvent(updatedEvent);
          count++;
        }
      }
    }
    
    await essenmelia.showSnackBar(`操作完成，已更新 ${count} 个事件`);
    
  } catch (e) {
    console.log('Error:', e);
    await essenmelia.showSnackBar('操作失败: ' + e);
  } finally {
    state.loading = false;
  }
}

async function compareAndMergeCollections() {
  if (state.loading) return;
  
  if (!cachedItems || cachedItems.length === 0) {
      await essenmelia.showSnackBar('请先获取收藏列表，再执行对比导入');
      return;
  }
  
  const confirm = await essenmelia.showConfirmDialog({
    title: '确认对比导入',
    message: '此操作将对比本地日程与 Bangumi 收藏：\n1. 更新已有日程的标题、简介、进度（不重新下载图片）。\n2. 导入本地缺失的日程。\n是否继续？',
    confirmLabel: '开始合并',
    cancelLabel: '取消'
  });
  
  if (!confirm) return;

  state.loading = true;
  await essenmelia.showSnackBar('正在获取本地日程...');
  
  try {
    const localEvents = await essenmelia.getEvents();
    
    // Build map of Local Event by Bangumi ID
    const localMap = {};
    const regex = /Bangumi ID: (\d+)/;
    
    for (let i = 0; i < localEvents.length; i++) {
        const event = localEvents[i];
        if (event.description) {
            const match = event.description.match(regex);
            if (match && match[1]) {
                localMap[match[1]] = event;
            }
        }
    }
    
    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    await essenmelia.showSnackBar('开始对比合并...');
    
    const total = cachedItems.length;

    for (let i = 0; i < total; i++) {
        const item = cachedItems[i];
        const subject = item.subject || {};
        const subjectId = subject.id;
        
        if (!subjectId) continue;
        
        // Progress update every 10 items
        if (i % 10 === 0) {
             await essenmelia.showSnackBar(`正在处理... (${i+1}/${total})`);
        }
        
        // Construct args (same logic as importAll/addToEvent cache override)
        const images = subject.images || {};
        const args = {
            title: subject.name_cn || subject.name,
            originalTitle: subject.name,
            cover: images.common || images.medium || images.large || '',
            eps: (subject.eps || 0).toString(),
            watched: (item.ep_status || 0).toString(),
            summary: subject.summary || subject.short_summary || '',
            score: (subject.score || '0').toString(),
            userScore: (item.rate || '0').toString(),
            userComment: item.comment || '',
            userTags: (item.tags || []).join(','),
            collectionStatus: (item.type || 0).toString(),
            subjectId: subjectId
        };

        const data = prepareEventData(args);
        
        try {
            if (localMap[subjectId]) {
                // Update existing
                const localEvent = localMap[subjectId];
                
                // Exclude imageUrl to prevent overwrite/download
                const updateData = {
                    id: localEvent.id,
                    title: data.title,
                    description: data.description,
                    tags: data.tags,
                    steps: data.steps,
                    stepDisplayMode: data.stepDisplayMode,
                    stepSuffix: data.stepSuffix
                    // imageUrl is explicitly OMITTED
                };
                
                await essenmelia.updateEvent(updateData);
                updatedCount++;
            } else {
                // Add new
                await essenmelia.addEvent(data);
                addedCount++;
            }
        } catch (e) {
            console.log('Error processing ' + args.title + ': ' + e);
            errorCount++;
        }
    }
    
    await essenmelia.showSnackBar(`合并完成: 新增 ${addedCount}, 更新 ${updatedCount}, 失败 ${errorCount}`);
    
  } catch (e) {
    console.log('Error in merge:', e);
    await essenmelia.showSnackBar('合并失败: ' + e);
  } finally {
    state.loading = false;
  }
}

// Lifecycle hook
function onLoad() {
  console.log('Bangumi Collection extension loaded');
  return { status: 'loaded' };
}
