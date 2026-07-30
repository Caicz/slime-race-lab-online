const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../app/scripts/request-policy.js');

test('Retry-After 支持秒数和 HTTP 日期并限制等待范围', () => {
    const now = Date.parse('2026-07-30T00:00:00Z');

    assert.equal(policy.getRetryDelayMilliseconds('2', now), 2000);
    assert.equal(policy.getRetryDelayMilliseconds('Thu, 30 Jul 2026 00:00:03 GMT', now), 3000);
    assert.equal(policy.getRetryDelayMilliseconds('', now), 1500);
    assert.equal(policy.getRetryDelayMilliseconds('60', now), 5000);
    assert.equal(policy.getRetryDelayMilliseconds('0', now), 500);
});

test('响应头读取不区分大小写', () => {
    assert.equal(policy.getHeaderValue({'Retry-After': '2'}, 'retry-after'), '2');
    assert.equal(policy.getHeaderValue({'retry-after': '3'}, 'Retry-After'), '3');
    assert.equal(policy.getHeaderValue(new Headers({'Retry-After': '4'}), 'retry-after'), '4');
});

test('接口映射保持串行且保留原顺序', async () => {
    let active = 0;
    let maximumActive = 0;
    const values = await policy.mapSequential([1, 2, 3], async value => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await policy.delay(1);
        active -= 1;
        return value * 2;
    }, 0);

    assert.deepEqual(values, [2, 4, 6]);
    assert.equal(maximumActive, 1);
});
