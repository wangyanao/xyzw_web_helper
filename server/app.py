"""
xyzw-web-helper 后端服务
用途：保存微信扫码/bin导入产生的 bin 文件到服务器，供随时恢复使用
"""

import os
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ===== 存储目录 =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(BASE_DIR, 'bin')
os.makedirs(BIN_DIR, exist_ok=True)

# ===== JWT_SECRET（可通过环境变量设置，留空则不验证）=====
UPLOAD_SECRET = os.environ.get('UPLOAD_SECRET', '')


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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f'[xyzw-bin-server] 启动在 http://0.0.0.0:{port}')
    print(f'[xyzw-bin-server] Bin 目录: {BIN_DIR}')
    if UPLOAD_SECRET:
        print(f'[xyzw-bin-server] 上传密钥已启用')
    else:
        print(f'[xyzw-bin-server] ⚠️  上传密钥未设置，任何人都可上传（建议设置 UPLOAD_SECRET 环境变量）')
    app.run(host='0.0.0.0', port=port, debug=False)
