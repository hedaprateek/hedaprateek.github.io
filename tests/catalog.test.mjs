import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLive,buildProject,fetchLatestRelease,assetPlatform} from '../scripts/build-projects.mjs';
const repo={name:'example',description:'Example',html_url:'https://github.com/hedaprateek/example',language:'HTML',pushed_at:'2026-10-13T00:00:00Z'};
const response=(status,data)=>({ok:status>=200 && status<300,status,json:async()=>data});
test('a published website is live even when an old override said local',async()=>{
  const result=await buildProject(repo,{example:{status:'local'}},async(url,options)=>
    options.method==='HEAD'?response(200):response(200,[]));
  assert.equal(result.project.status,'live');assert.equal(result.project.category,'live');
  assert.equal(result.project.live,'https://hedaprateek.github.io/example/');
});
test('a live override with a broken URL cannot label an unpublished project live',async()=>{
  const result=await buildProject(repo,{example:{status:'live',live:'https://unpublished.example/'}},async(url,options)=>
    options.method==='HEAD'?response(404):response(200,[]));
  assert.equal(result.project.status,'source');assert.equal(result.project.category,'unpublished');
  assert.equal(result.project.live,null);
});
test('detects a custom homepage and ignores repository or executable URLs',async()=>{
  let requests=[];
  const live=await detectLive({...repo,homepage:'https://tools.example/'},{live:'javascript:alert(1)'},async url=>{
    requests.push(url);return response(200);
  });
  assert.equal(live,'https://tools.example/');assert.deepEqual(requests,['https://tools.example/']);
});
test('Windows software goes into downloads, with the correct platform',async()=>{
  const result=await buildProject({...repo,name:'pc-cleaner'},{'pc-cleaner':{title:'PC Cleaner',category:'download'}},async(url,options)=>
    options.method==='HEAD'?response(404):response(200,[{tag_name:'v1.0.0',name:'PC Cleaner',draft:false,
      published_at:'2026-10-13T00:00:00Z',assets:[{name:'PC-Cleaner-win-x64.zip',size:1024,state:'uploaded',browser_download_url:'https://github.com/download.zip'}]}]));
  assert.equal(result.project.category,'download');assert.equal(result.download.assets[0].platform,'Windows');
  assert.equal(result.download.assets[0].size,'1.0 KB');
});
test('an unpublished build gets no fake download link',async()=>{
  const result=await buildProject(repo,{example:{category:'download'}},async(url,options)=>
    options.method==='HEAD'?response(404):response(200,[]));
  assert.equal(result.download.version,'Build pending');assert.deepEqual(result.download.assets,[]);
});
test('downloads find the latest stable release with uploaded assets',async()=>{
  const release=await fetchLatestRelease('example',async()=>response(200,[
    {draft:true,assets:[{}]}, {prerelease:true,assets:[{}]}, {tag_name:'empty',assets:[]},
    {tag_name:'stable',name:'Stable',assets:[{name:'app.apk',size:1024,state:'uploaded',browser_download_url:'https://github.com/app.apk'}]}
  ]));
  assert.equal(release.version,'stable');assert.equal(release.assets[0].platform,'Android APK');
  assert.equal(assetPlatform('PC Cleaner.exe'),'Windows');
});
test('release permission or server errors fail the refresh instead of silently removing downloads',async()=>{
  await assert.rejects(fetchLatestRelease('example',async()=>response(403)),/GitHub 403/);
  assert.equal(await fetchLatestRelease('example',async()=>response(404)),null);
});
