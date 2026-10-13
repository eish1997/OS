import {readFileSync,writeFileSync} from 'node:fs';
for(const p of ['doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md','doc/README.md']){
 const source=readFileSync(p,'utf8');writeFileSync(p,source.replaceAll('144项','145项').replaceAll('7项新增','8项新增').replace('051新增7项','051新增8项').replace('；7项新增测试','；8项新增测试'));
}
