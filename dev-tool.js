var DOCUMENT_ROOT, STATIC_ROOT, REWRITE_FILE;
var express = require('express');
var router = express.Router();
var path = require('path'), fs = require('fs');
var exists = fs.existsSync || path.existsSync;

function isFile(path){
    return exists(path) && fs.statSync(path).isFile(); 
}

function getRefs(id, map){
    var refs = [];

    (map[id].refs || []).forEach(function(ref){
        refs.push(ref);
        refs.unshift.apply(refs, getRefs(ref, map));
    });

    return refs;
}

module.exports = function(root, static_root){
    DOCUMENT_ROOT = root;
    STATIC_ROOT = static_root;
    REWRITE_FILE = path.join(DOCUMENT_ROOT, 'conf/rewrite.js');
    ENGINE_FILE = path.join(DOCUMENT_ROOT, 'conf/engine.json');

    router.use(function(req, res, next){
        var config = JSON.parse(fs.readFileSync(ENGINE_FILE));

        if(config.combo && req.originalUrl.indexOf(config.combo.syntax[0]) == 1){
            var combos = req.originalUrl.split(config.combo.syntax[0]);

            if(combos.length > 1){
                //handle combo
                combos = combos[1].split(config.combo.syntax[1]);

                var content = '';

                for(var i = 0, j = combos.length; i < j; i++){
                    var file = path.join(STATIC_ROOT, combos[i]);

                    if(!isFile(file)){
                        res.status(404).end();
                        return;
                    }else{
                        content += fs.readFileSync(file).toString() + '\n'; 
                    }
                }

                res.writeHead(200, {'Content-Type': /(?:css|less|sass)(?:\?|$)/.test(combos[0]) ? 'text/css' : 'text/javascript'});
                res.end(content);
                return;
            }
        }

        var rewrites, url = req.path || '/', file;

        try{
            //强制清除加载的文件，重新加载
            delete require.cache[REWRITE_FILE];
            rewrites = require(REWRITE_FILE);
        }catch(e){}

        try{
            if(rewrites){
                for(var key in rewrites){
                    if((new RegExp(key, 'i')).test(req.originalUrl)){
                        url = rewrites[key];

                        if(typeof url == 'function'){
                            url(req, res, next);
                            return;
                        }

                        break;
                    }
                }
            }


            file = path.join(DOCUMENT_ROOT, url);

            if(isFile(file) && !/\.html$/.test(file)){
                res.sendFile(file, function(){
                    next();
                });
                return;
            }

            file = file.replace('.html', '') + '.html';

            if(!isFile(file) && url == '/'){
                file = path.join(DOCUMENT_ROOT, 'index.html');
            }

            if(isFile(file)){  
                var bContent = '', mapJson = JSON.parse(fs.readFileSync(path.join(DOCUMENT_ROOT, 'map.json')));

                if(/pagelet[\/\\]/.test(file) && 'debug' in req.query){
                    bContent = '<script src="' + mapJson['static/feather.js'].url + '"></script>';
                }

                var id = path.relative(DOCUMENT_ROOT, file).replace(/\\+/g, '/');
                var refs = ['_global_.html'].concat(getRefs(id, mapJson)), datas = {};

                for(var i = 0; i < refs.length; i++){
                    var dataFile = path.join(DOCUMENT_ROOT, 'data', refs[i].replace('.html', '.json'));

                    if(isFile(dataFile)){
                        try{
                            var c = (fs.readFileSync(dataFile) || '').toString().trim();

                            if(c){
                                var data = JSON.parse(c) || {};

                                for(var key in data){
                                    datas[key] = data[key];
                                }
                            }
                        }catch(e){
                            return res.status(500).send(dataFile + ' is not a valid json file!')
                        }
                    }
                }

                res.render(file, datas, function(err, html){
                    res.send(bContent + html);
                });

                return;
            }
        }catch(e){
            res.status(500).send(e.message);
        }

        next();
    });

    return router;
};