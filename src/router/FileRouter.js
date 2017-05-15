var fs = require('fs')
var fse = require('fs-extra')
var grunt = require('grunt')
var path = require('path')
var JSZip = require('jszip')

var systemConfig = require('../config.js').getConfig()
var BaseRouter = require('./BaseRouter.js')
var RouterUtils = require('../util/RouterUtils.js')
var FileUtils = require("../util/FileUtils.js").init(systemConfig.workspace.path)

class MyRouter extends BaseRouter {
    init() {
        var me = this
        this.json('/file/add', function(req, res) {
            var newFileName = FileUtils.getPath(req.query.path, req.query.fileName)
            var isDir = req.query.isDir == '1'
            var method = isDir ? 'ensureDir' : 'ensureFile'
            fse[method].call(fse, newFileName, function(err) {
                if (err) {
                    RouterUtils.fail(res)
                } else {
                    RouterUtils.success(res)
                }
            })
        }).json('/file/rename', function(req, res) {
            var oldFilePath = FileUtils.getPath(req.query.path)
            var newFilePath = FileUtils.getPath(req.query.path, '..', req.query.fileName)
            if (fs.existsSync(newFilePath)) {
                RouterUtils.fail(res, '新的文件夹或目录已存在')
            } else {
                fs.rename(oldFilePath, newFilePath, function(err) {
                    if (err) {
                        RouterUtils.fail(res)
                    } else {
                        RouterUtils.success(res)
                    }
                })
            }
        }).html('/file/edit', function(req, res) {
            var obj = req.query
            if (req.query.path) {
                var currentPath = FileUtils.getPath(req.query.path)
                if (fs.existsSync(currentPath)) {
                    var encoding = req.query.encoding || FileUtils.getFileEncoding(currentPath)
                    var content = FileUtils.getFileContent(currentPath, encoding)
                    var ext = path.extname(currentPath)
                    if (ext) {
                        ext = ext.substring(1)
                    }
                    obj.mtime = FileUtils.getLastModifiedTime(currentPath)
                    obj.encoding = encoding
                    obj.ext = ext
                    obj.content = content
                    obj.pp = obj.path.replace(/\\/g, '\\\\')
                    res.render('file/edit', obj)
                } else {
                    RouterUtils.error(res, '获取文件失败！')
                }
            } else {
                RouterUtils.error(res, '参数异常！')
            }
        }).html('/file/content', function(req, res) {
            var obj = req.query
            if (req.query.path) {
                var currentPath = FileUtils.getPath(req.query.path)
                if (fs.existsSync(currentPath)) {
                    var encoding = req.query.encoding || FileUtils.getFileEncoding(currentPath)
                    var content = FileUtils.getFileContent(currentPath, encoding)
                    var ext = path.extname(currentPath)
                    if (ext) {
                        ext = ext.substring(1)
                    }
                    obj.mtime = FileUtils.getLastModifiedTime(currentPath)
                    obj.encoding = encoding
                    obj.ext = ext
                    obj.content = content
                    obj.pp = obj.path.replace(/\\/g, '\\\\')
                    RouterUtils.success(res, undefined, { data: obj })
                } else {
                    RouterUtils.fail(res, '获取文件失败！')
                }
            } else {
                RouterUtils.fail(res, '参数异常！')
            }
        }).json('/file/save', 'post', function(req, res) {
            var obj = { code: -1, message: '保存失败，请稍后再试～～' }
            if (req.body && req.body.path) {
                var currentName = FileUtils.getPath(req.body.path)
                var encoding = req.body.encoding || FileUtils.getFileEncoding(currentName)
                var currentTime = FileUtils.getLastModifiedTime(currentName)
                var oldTime = req.body.mtime
                if (oldTime != currentTime) {
                    obj.code == -1
                    obj.message = '保存失败！当前文档已过期，请刷新页面～～'
                } else {
                    FileUtils.writeFileContent(currentName, req.body.content, encoding);
                    obj.code = 1
                    obj.message = 'success'
                    obj.mtime = FileUtils.getLastModifiedTime(currentName)
                }
                res.json(obj)
            } else {
                res.json(obj)
            }
        }).json('/file/delete', function(req, res) {
            var ret = { code: 0 },
                obj = req.query,
                currentName = FileUtils.getPath(obj.path)
            if (!fs.existsSync(currentName)) {
                ret.code = -1
                ret.message = '无法找到对应文件或目录'
            } else {
                try {
                    FileUtils.removeFile(currentName)
                    ret.code = 1
                } catch (e) {
                    ret.code = -2
                }
            }
            res.json(ret)
        }).html('/file/view', function(req, res) {
            var obj = req.query
            var currentName = FileUtils.getPath(obj.path)
            var buffer = fs.readFileSync(currentName)
            if (buffer) {
                res.writeHead(200, { 'Content-Type': FileUtils.getFileMimeType(obj.path) })
                res.end(buffer, 'binary')
            } else {
                RouterUtils.error(res, "获取文件失败！");
            }
        }).json('/file/upload', 'post', function(req, res) {
            var pp = req.query.path
            var currentName = FileUtils.getPath(pp)
            if (req.files && req.files.Filedata) {
                var oldName = path.join(currentName, req.files.Filedata.name)
                var newName = path.join(currentName, req.files.Filedata.originalname)
                grunt.file.copy(req.files.Filedata.path, path.join(currentName, req.files.Filedata.originalname))
            }
            if(req.isIE){
                res.set({
                    'Content-Type': 'text/plain'
                });
                res.send(JSON.parse(res));
            }
            else{
                RouterUtils.success(res)
            }
        }).html('/file/download', function(req, res) {
            var obj = req.query
            var currentName = FileUtils.getPath(obj.path)
            var listFolder = function(dir, basename, zip) {
                var list = fs.readdirSync(dir)
                list.forEach(function(item) {
                    var newPath = path.join(dir, item)
                    var newBaseName = path.join(basename, item)
                    var st = fs.statSync(newPath)
                    if (st.isFile()) {
                        zip.file(newBaseName, fs.readFileSync(newPath))
                    } else if (st.isDirectory()) {
                        listFolder(newPath, newBaseName, zip)
                    }
                })
            }
            fs.stat(currentName, function(err, stats) {
                if (err) {
                    RouterUtils.error(res, '获取文件失败！')
                } else {
                    if (stats.isDirectory()) {
                        var basename = path.basename(currentName)
                        res.attachment(basename + '.zip')
                        var zip = new JSZip()
                        zip.folder(basename)
                        listFolder(currentName, basename, zip)
                        zip.generateNodeStream({ streamFile: true })
                            .pipe(res)
                            .on('finish', function() {
                                res.end()
                            })
                    } else if (stats.isFile()) {
                        res.download(currentName)
                    } else {
                        RouterUtils.error(res, '不支持的文件格式！')
                    }
                }
            })
        }).json('/file/tree', function(req, res) {
            var filePath = req.query.path
            if (!filePath) {
                filePath = '.'
            }
            RouterUtils.success(res, null, {
                data: [{
                    text: path.basename(FileUtils.getPath(filePath)),
                    state: 'open',
                    href: '.',
                    dir: 1,
                    children: getFileTree(filePath)
                }]
            })
        });
    }
}

function getFileTree(newPath) {
    var tree = []
    var pp = FileUtils.getPath(newPath)
    if (fs.existsSync(pp)) {
        var files = fs.readdirSync(pp)
        for (var i = 0; i < files.length; i++) {
            var item = files[i],
                pp1 = path.join(pp, item),
                pp2 = path.join(newPath, item),
                st = fs.statSync(pp1),
                obj = {
                    'text': item,
                    'href': pp2,
                    'dir': '0'
                }
            if (st.isDirectory()) {
                obj.children = getFileTree(pp2)
                obj.state = 'closed'
                obj.dir = '1'
            }
            tree.push(obj)
        }
        tree.sort(function(value1, value2) {
            if (value1.dir != value2.dir) {
                return value2.dir - value1.dir
            } else {
                return value1.text > value2.text ? 1 : -1
            }
        })
    }
    return tree
}

module.exports = exports = function(map) {
    return (new MyRouter()).load(map)
}