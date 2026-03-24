"""
xyzw-web-helper 后端服务
用途：保存微信扫码/bin导入产生的 bin 文件到服务器，供随时恢复使用
"""

import os
import re
import json
import subprocess
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, EVENT_JOB_MISSED

app = Flask(__name__)
CORS(app)

# ===== 存储目录 =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(BASE_DIR, 'bin')
DATA_DIR = os.path.join(BASE_DIR, 'data')
TASKS_FILE = os.path.join(DATA_DIR, 'tasks.json')
TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')
RUN_TASK_JS = os.path.join(BASE_DIR, 'run_task.js')
os.makedirs(BIN_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# ===== JWT_SECRET（可通过环境变量设置，留空则不验证）=====
UPLOAD_SECRET = os.environ.get('UPLOAD_SECRET', '')

# ===== APScheduler =====
scheduler = BackgroundScheduler(
    timezone='Asia/Shanghai',
    job_defaults={
        'misfire_grace_time': 3600,  # 允许最多1小时内补发（防容器重启/延迟导致错过）
        'coalesce': True,            # 错过多次只补发一次
    }
)

def _job_event_listener(event):
    if hasattr(event, 'exception') and event.exception:
        print(f'[scheduler] ❌ 任务执行出错: {event.job_id} → {event.exception}', flush=True)
    elif hasattr(event, 'scheduled_run_time'):
        # MISSED event
        print(f'[scheduler] ⚠️  任务错过执行: {event.job_id}, 计划时间: {event.scheduled_run_time}', flush=True)

scheduler.add_listener(_job_event_listener, EVENT_JOB_ERROR | EVENT_JOB_MISSED)


def check_secret():
    """验证请求头中的 X-Upload-Secret，为空时跳过验证"""
    if not UPLOAD_SECRET:
        return True
    return request.headers.get('X-Upload-Secret', '') == UPLOAD_SECRET


def safe_filename(filename: str) -> str:
    """防路径穿越，同时保留 Unicode（中文）字符"""
    # 只取文件名部分，去掉任何路径前缀
    filename = os.path.basename(filename)
    # 禁止 '..' 序列
    filename = filename.replace('..', '')
    # 只保留：Unicode 字母/数字、中文、连字符、下划线、点
    filename = re.sub(r'[^\w\u4e00-\u9fff\-.]', '_', filename)
    return filename.strip('._') or 'unnamed.bin'


# ===== 路由 =====

@app.route('/api/bin/upload', methods=['POST'])
def upload_bin():
    """
    接收前端上传的 bin 文件，保存到服务器
    Query: filename=xxx.bin
    Body: 二进制数据
    Header: X-Upload-Secret: <secret>（环境变量 UPLOAD_SECRET 不为空时必须提供）
    """
    if not check_secret():
        return jsonify({'error': '上传密钥错误'}), 403

    filename = request.args.get('filename', '').strip()
    if not filename:
        return jsonify({'error': '缺少 filename 参数'}), 400

    # 安全文件名，强制 .bin 后缀
    safe_name = safe_filename(filename)
    if not safe_name:
        return jsonify({'error': '非法文件名'}), 400
    if not safe_name.endswith('.bin'):
        safe_name += '.bin'

    data = request.get_data()
    if not data:
        return jsonify({'error': '请求体为空'}), 400

    filepath = os.path.join(BIN_DIR, safe_name)
    with open(filepath, 'wb') as f:
        f.write(data)

    size = len(data)
    print(f'[bin] 已保存: {safe_name} ({size} bytes)')
    return jsonify({'success': True, 'filename': safe_name, 'size': size})


@app.route('/api/bin/list', methods=['GET'])
def list_bins():
    """列出服务器上所有已保存的 bin 文件"""
    if not check_secret():
        return jsonify({'error': '密钥错误'}), 403

    files = []
    for fname in sorted(os.listdir(BIN_DIR)):
        if not fname.endswith('.bin'):
            continue
        fpath = os.path.join(BIN_DIR, fname)
        stat = os.stat(fpath)
        files.append({
            'name': fname,
            'size': stat.st_size,
            'mtime': int(stat.st_mtime),
        })

    return jsonify({'files': files})


@app.route('/api/bin/download/<filename>', methods=['GET'])
def download_bin(filename):
    """下载指定 bin 文件"""
    if not check_secret():
        return jsonify({'error': '密钥错误'}), 403

    safe_name = safe_filename(filename)
    filepath = os.path.join(BIN_DIR, safe_name)
    if not os.path.isfile(filepath):
        return jsonify({'error': '文件不存在'}), 404

    return send_from_directory(BIN_DIR, safe_name, as_attachment=True)


@app.route('/api/bin/delete/<filename>', methods=['DELETE'])
def delete_bin(filename):
    """删除指定 bin 文件"""
    if not check_secret():
        return jsonify({'error': '密钥错误'}), 403

    safe_name = safe_filename(filename)
    filepath = os.path.join(BIN_DIR, safe_name)
    if not os.path.isfile(filepath):
        return jsonify({'error': '文件不存在'}), 404

    os.remove(filepath)
    return jsonify({'success': True})


@app.route('/api/bin/health', methods=['GET'])
def health():
    """健康检查接口"""
    count = len([f for f in os.listdir(BIN_DIR) if f.endswith('.bin')])
    return jsonify({'status': 'ok', 'bin_count': count})


# ===== 定时任务工具函数 =====

def load_tasks():
    """从 tasks.json 读取任务列表"""
    try:
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def save_tasks(tasks):
    """保存任务列表到 tasks.json"""
    with open(TASKS_FILE, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)


def load_tokens():
    """从 tokens.json 读取 token 映射"""
    try:
        with open(TOKENS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_tokens(tokens):
    """保存 token 映射到 tokens.json"""
    with open(TOKENS_FILE, 'w', encoding='utf-8') as f:
        json.dump(tokens, f, ensure_ascii=False, indent=2)


def _fire_task(task_id):
    """APScheduler 回调 —— 启动 Node.js 子进程执行任务"""
    tasks = load_tasks()
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        print(f'[scheduler] 任务 {task_id} 不存在，跳过')
        return
    if not task.get('enabled', True):
        print(f'[scheduler] 任务 {task["name"]} 已禁用，跳过')
        return

    print(f'[scheduler] {datetime.now()} 触发任务: {task["name"]}', flush=True)
    print(f'[scheduler] tokens 路径: {TOKENS_FILE}, tasks 路径: {TASKS_FILE}', flush=True)
    try:
        proc = subprocess.Popen(
            ['node', RUN_TASK_JS],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        task_json = json.dumps(task, ensure_ascii=False).encode('utf-8')
        stdout, _ = proc.communicate(input=task_json, timeout=300)
        print(stdout.decode('utf-8', errors='replace'))
        print(f'[scheduler] 任务 {task["name"]} 执行完毕，退出码: {proc.returncode}')
    except subprocess.TimeoutExpired:
        proc.kill()
        print(f'[scheduler] 任务 {task["name"]} 超时（5分钟）已终止')
    except Exception as e:
        print(f'[scheduler] 任务 {task["name"]} 启动失败: {e}')


def _add_job(task):
    """将任务注册到 APScheduler"""
    task_id = task['id']
    job_id = f'task_{task_id}'

    # 先移除旧 job（若存在）
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not task.get('enabled', True):
        return

    run_type = task.get('runType', 'daily')
    if run_type == 'daily':
        run_time = task.get('runTime', '08:00')
        h, m = run_time.split(':')
        scheduler.add_job(
            _fire_task,
            CronTrigger(hour=int(h), minute=int(m), timezone='Asia/Shanghai'),
            id=job_id,
            args=[task_id],
            replace_existing=True,
        )
    elif run_type == 'cron':
        cron_expr = task.get('cronExpression', '0 8 * * *')
        scheduler.add_job(
            _fire_task,
            CronTrigger.from_crontab(cron_expr, timezone='Asia/Shanghai'),
            id=job_id,
            args=[task_id],
            replace_existing=True,
        )
    print(f'[scheduler] 已注册任务: {task["name"]} ({run_type})', flush=True)


# ===== 定时任务 API =====

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有定时任务"""
    return jsonify(load_tasks())


@app.route('/api/tasks/sync', methods=['POST'])
def sync_tasks():
    """
    前端同步全量任务列表到服务器
    Body: JSON 数组（所有定时任务）
    """
    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({'error': '请求体必须是 JSON 数组'}), 400

    save_tasks(data)

    # 重新注册所有 job
    for task in data:
        _add_job(task)

    # 移除已不存在的 job
    existing_ids = {f'task_{t["id"]}' for t in data}
    for job in scheduler.get_jobs():
        if job.id.startswith('task_') and job.id not in existing_ids:
            scheduler.remove_job(job.id)
            print(f'[scheduler] 已移除旧任务 job: {job.id}')

    return jsonify({'success': True, 'count': len(data)})


@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """删除指定任务"""
    tasks = load_tasks()
    tasks = [t for t in tasks if t['id'] != task_id]
    save_tasks(tasks)

    job_id = f'task_{task_id}'
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    return jsonify({'success': True})


@app.route('/api/tasks/<task_id>/trigger', methods=['POST'])
def trigger_task(task_id):
    """立即手动触发一次指定任务（测试用）"""
    tasks = load_tasks()
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': '任务不存在'}), 404

    import threading
    threading.Thread(target=_fire_task, args=(task_id,), daemon=True).start()
    return jsonify({'success': True, 'message': f'任务 {task["name"]} 已触发（后台执行）'})


# ===== Token 同步 API =====

@app.route('/api/tokens/sync', methods=['POST'])
def sync_tokens():
    """
    前端同步 token 数据到服务器（供定时任务使用）
    Body: { tokenId: { id, name, token, server }, ... }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    # 只保存必要字段，不存敏感信息明文（但 token 本身已是 Base64/JSON 格式）
    safe = {}
    for tid, tdata in data.items():
        safe[tid] = {
            'id':          tdata.get('id', tid),
            'name':        tdata.get('name', ''),
            'token':       tdata.get('token', ''),
            'server':      tdata.get('server', ''),
            'importMethod': tdata.get('importMethod', 'manual'),
        }

    save_tokens(safe)
    return jsonify({'success': True, 'count': len(safe)})


@app.route('/api/tokens', methods=['GET'])
def get_tokens():
    """返回已存储的 token 列表（脱敏，不返回 token 字段）"""
    tokens = load_tokens()
    result = [
        {'id': v['id'], 'name': v['name'], 'server': v['server']}
        for v in tokens.values()
    ]
    return jsonify(result)


@app.route('/api/scheduler/jobs', methods=['GET'])
def list_scheduler_jobs():
    """查看 APScheduler 当前注册的所有 job"""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            'id': job.id,
            'name': job.name,
            'next_run': str(job.next_run_time) if job.next_run_time else None,
        })
    return jsonify({'running': scheduler.running, 'jobs': jobs})


# ===== 启动时加载任务 =====
def _load_and_schedule_all():
    """从 tasks.json 加载任务并注册到 APScheduler"""
    tasks = load_tasks()
    for task in tasks:
        try:
            _add_job(task)
        except Exception as e:
            print(f'[scheduler] 加载任务 {task.get("name")} 失败: {e}')
    print(f'[scheduler] 已加载 {len(tasks)} 个定时任务')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f'[xyzw-bin-server] 启动在 http://0.0.0.0:{port}')
    print(f'[xyzw-bin-server] Bin 目录: {BIN_DIR}')
    if UPLOAD_SECRET:
        print(f'[xyzw-bin-server] 上传密钥已启用')
    else:
        print(f'[xyzw-bin-server] ⚠️  上传密钥未设置，任何人都可上传（建议设置 UPLOAD_SECRET 环境变量）')

    # 启动定时任务调度器
    _load_and_schedule_all()
    scheduler.start()
    print(f'[scheduler] APScheduler 已启动', flush=True)

    app.run(host='0.0.0.0', port=port, debug=False)
