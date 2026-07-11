// ==UserScript==
// @name         B站字幕助手
// @namespace    /DBI/bilibili-subtitle-assistant
// @version      1.0.0
// @description  自动开启 AI 中文字幕，仅在用户未手动操作字幕时生效; 按Z键开关字幕
// @author       habixz
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/cheese/play/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /**
   * 这里直接沿用你旧脚本已经验证过可用的选择器，
   * 不再额外做结构性重构，尽量保持行为稳定。
   */
    const SUBTITLE_BTN_SELECTOR = '.bpx-player-ctrl-subtitle';
    const SUBTITLE_MENU_SELECTOR = '.bpx-player-ctrl-subtitle-panel';
    const AI_ZH_ITEM_SELECTOR = '.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]';
    const SUBTITLE_CLOSE_SWITCH_SELECTOR = '.bpx-player-ctrl-subtitle-close-switch';
    const ACTIVE_LANGUAGE_SELECTOR = '.bpx-player-ctrl-subtitle-language-active';
    const ACTIVE_BUTTON_CLASS = 'bpx-player-ctrl-btn--active';
    const ACTIVE_SUBTITLE_ITEM_CLASS = 'bpx-state-active';
    const TOGGLE_SUBTITLE_SHORTCUT_CODE = 'KeyZ';

    /**
   * 记录当前页面和当前页面上的自动处理状态。
   * 状态仍然保持简单，只保留旧脚本实际依赖到的几项。
   */
    let lastUrl = location.href;
    let userHasInteracted = false;
    let hasAutoActivated = false;
    let retryCount = 0;
    let retryTimer = null;

    /**
   * 启动或重启当前页面的重试循环。
   * 这样站内跳转到新视频后，会重新开始尝试，而不是沿用旧页面已经结束的计数。
   */
    function startRetryLoop() {
        stopRetryLoop();
        retryCount = 0;

        retryTimer = setInterval(() => {
            if (!userHasInteracted && !hasAutoActivated && retryCount < 5) {
                activateAISubtitle();
                retryCount += 1;
            } else {
                stopRetryLoop();
            }
        }, 2000);
    }

    /**
   * 停止当前页面的轮询。
   */
    function stopRetryLoop() {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
    }

    /**
   * 监听用户对字幕按钮或字幕菜单的真实点击。
   * 这里保留你旧脚本的事件委托思路，只额外加上 isTrusted，
   * 避免脚本自己调用 click() 时被误判成用户手动干预。
   */
    function setupUserInteractionWatcher() {
        document.addEventListener('click', (event) => {
            if (!event.isTrusted) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            if (
                target.closest(SUBTITLE_BTN_SELECTOR) ||
                target.closest(SUBTITLE_MENU_SELECTOR)
            ) {
                userHasInteracted = true;
                console.log('[B站字幕助手] 检测到用户手动操作字幕，停止自动干预');
            }
        }, true);
    }

    /**
   * 判断当前触发目标是否位于可编辑区域内。
   * 这样按 Z 键时不会干扰输入框、文本域、富文本编辑器等原生输入行为。
   */
    function isEditableTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            return true;
        }

        if (target instanceof HTMLElement && target.isContentEditable) {
            return true;
        }

        return Boolean(target.closest('[contenteditable="true"]'));
    }

    /**
   * 获取字幕菜单里和开关相关的真实节点。
   * 这里不再把底部“字幕”按钮当成最终开关，
   * 因为实测真正控制开/关的是：
   * - AI 中文字幕项
   * - 关闭字幕项
   */
    function getSubtitleControlNodes() {
        const aiZhItem = document.querySelector(AI_ZH_ITEM_SELECTOR);
        const closeSwitch = document.querySelector(SUBTITLE_CLOSE_SWITCH_SELECTOR);

        return {
            aiZhItem,
            closeSwitch
        };
    }

    /**
   * 判断 AI 中文字幕当前是否已经开启。
   * 优先读取菜单项本身的激活态类名，
   * 不依赖底部按钮是否高亮，避免把“菜单已打开”和“字幕已开启”混为一谈。
   */
    function isAiZhSubtitleEnabled() {
        const { aiZhItem, closeSwitch } = getSubtitleControlNodes();

        if (!(aiZhItem instanceof HTMLElement)) {
            return false;
        }

        if (aiZhItem.classList.contains(ACTIVE_SUBTITLE_ITEM_CLASS)) {
            return true;
        }

        if (closeSwitch instanceof HTMLElement && closeSwitch.classList.contains(ACTIVE_SUBTITLE_ITEM_CLASS)) {
            return false;
        }

        const activeItem = aiZhItem.parentElement?.querySelector(ACTIVE_LANGUAGE_SELECTOR);
        return Boolean(activeItem && activeItem.closest('[data-lan="ai-zh"]'));
    }

    /**
   * 通过快捷键切换字幕总开关。
   * 这里直接点击字幕菜单中的真实开关项，而不是点击底部“字幕”按钮。
   *
   * 额外说明：
   * - 按 Z 属于用户主动操作，所以会标记为手动干预
   * - 一旦用户手动干预，就立即停止当前页面的自动重试，避免脚本和用户操作互相打架
   */
    function toggleSubtitleByShortcut() {
        const { aiZhItem, closeSwitch } = getSubtitleControlNodes();
        if (!(aiZhItem instanceof HTMLElement) || !(closeSwitch instanceof HTMLElement)) {
            return;
        }

        userHasInteracted = true;
        hasAutoActivated = false;
        stopRetryLoop();

        if (isAiZhSubtitleEnabled()) {
            closeSwitch.click();
            console.log('[B站字幕助手] 已通过 Z 键关闭字幕');
        } else {
            aiZhItem.click();
            console.log('[B站字幕助手] 已通过 Z 键开启 AI 中文字幕');
        }
    }

    /**
   * 监听 Z 键快捷键。
   * 只响应裸键按下：
   * - 不处理 Ctrl / Alt / Shift / Meta 组合键
   * - 不处理长按重复触发
   * - 不处理输入场景，避免影响正常打字
   */
    function setupShortcutListener() {
        document.addEventListener('keydown', (event) => {
            if (!event.isTrusted) {
                return;
            }

            const isTargetShortcut =
                event.code === TOGGLE_SUBTITLE_SHORTCUT_CODE ||
                String(event.key).toLowerCase() === 'z';

            if (!isTargetShortcut) {
                return;
            }

            if (event.repeat || event.isComposing) {
                return;
            }

            if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
                return;
            }

            if (isEditableTarget(event.target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            toggleSubtitleByShortcut();
        }, true);
    }

    /**
   * 判断当前页面是否还应该自动开启 AI 中文字幕。
   * 这部分逻辑基本保持旧脚本原样：
   * - 用户手动操作过，则不再自动处理
   * - 已经自动开启成功过，则不再重复处理
   * - 如果已经有其他字幕处于激活状态，则尊重当前状态，不覆盖
   */
    function shouldAutoActivate() {
        if (userHasInteracted) return false;
        if (hasAutoActivated) return false;

        const aiZhItem = document.querySelector(AI_ZH_ITEM_SELECTOR);
        if (!aiZhItem) return true;

        const activeItem = aiZhItem.parentElement?.querySelector(ACTIVE_LANGUAGE_SELECTOR);
        if (activeItem) {
            if (activeItem.closest('[data-lan="ai-zh"]')) {
                hasAutoActivated = true;
                return false;
            }

            userHasInteracted = true;
            return false;
        }

        return true;
    }

    /**
     * 按照旧脚本已经验证过的顺序执行：
     * 1. 找到字幕按钮
     * 2. 如果字幕总开关未开启，则先点击字幕按钮
     * 3. 延迟 300ms 后再尝试点击 AI 中文字幕项
     *
     * 这个顺序比前面那版重构更接近你原先的成功路径。
     */
    function activateAISubtitle() {
        if (!shouldAutoActivate()) return;

        const subtitleBtn = document.querySelector(SUBTITLE_BTN_SELECTOR);
        if (!(subtitleBtn instanceof HTMLElement)) {
            return;
        }

        if (getComputedStyle(subtitleBtn).display === 'none') {
            return;
        }

        const isSubtitleOn = subtitleBtn.classList.contains(ACTIVE_BUTTON_CLASS);

        if (!isSubtitleOn) {
            subtitleBtn.click();
            setTimeout(() => {
                clickAiZhItem();
            }, 300);
        } else {
            clickAiZhItem();
        }
    }

    /**
     * 尝试点击 AI 中文字幕项。
     * 这里再次查询菜单项，而不是复用旧引用，
     * 因为 B 站常常在展开面板后才真正把语言项渲染到 DOM 中。
     */
    function clickAiZhItem() {
        const aiZhItem = document.querySelector(AI_ZH_ITEM_SELECTOR);
        if (!(aiZhItem instanceof HTMLElement)) {
            return;
        }

        if (!aiZhItem.closest(ACTIVE_LANGUAGE_SELECTOR)) {
            aiZhItem.click();
            hasAutoActivated = true;
            console.log('[B站字幕助手] 已自动启用 AI 中文字幕');
        }
    }

    /**
     * 站内切换到新视频时，重置当前页面状态。
     * 这里仍保持你的原有策略：新视频页上的字幕处理互相独立。
     */
    function onUrlChange() {
        const currentUrl = location.href;
        if (currentUrl === lastUrl) return;

        lastUrl = currentUrl;
        userHasInteracted = false;
        hasAutoActivated = false;

        setTimeout(() => {
            activateAISubtitle();
            startRetryLoop();
        }, 800);
    }

    /**
     * 监听 B 站 SPA 路由变化。
     * 在旧脚本基础上多补了 replaceState，
     * 因为部分页面切换场景不会只走 pushState。
     */
    function setupNavigationWatcher() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            onUrlChange();
            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            onUrlChange();
            return result;
        };

        window.addEventListener('popstate', onUrlChange);
    }

    /**
     * 启动脚本。
     * 初始页直接先启动一次，再开始保险轮询。
     */
    setupUserInteractionWatcher();
    setupShortcutListener();
    setupNavigationWatcher();
    activateAISubtitle();
    startRetryLoop();
})();
