// Read-only architecture evidence helper. Uses an existing TypeScript installation.
// Usage: node static-analysis.cjs <snapshot-root> <raw-output-json> [dependency-root]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require(require.resolve('typescript', {paths:[process.argv[4] ?? process.argv[2]]}));
const root=process.argv[2], out=process.argv[3];
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const names=['src','scripts','test'].flatMap(d=>fs.existsSync(path.join(root,d))?walk(path.join(root,d)):[]).filter(p=>/\.[cm]?[jt]s$/.test(p));
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const files=names.map(p=>relative(p)), set=new Set(files), edges=[], modules=[], calls=[];
for(const p of names){
 const file=relative(p), source=fs.readFileSync(p,'utf8'), sf=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 const decls=[]; let dynamic=[];
 function visit(n,owner='<module>'){
  if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)){
   const spec=n.moduleSpecifier?.text;
   if(spec){let resolved=null; if(spec.startsWith('.')){const base=path.resolve(path.dirname(p),spec);for(const cand of [base.replace(/\.js$/,'.ts'),base,path.join(base,'index.ts')])if(fs.existsSync(cand)&&fs.statSync(cand).isFile()){resolved=relative(cand);break;}}
    const clause=n.importClause;
    const typeOnly=!!(n.isTypeOnly||(ts.isExportDeclaration(n)&&n.exportClause&&ts.isNamedExports(n.exportClause)&&n.exportClause.elements.length&&n.exportClause.elements.every(x=>x.isTypeOnly))||clause?.isTypeOnly||(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&!clause.name&&clause.namedBindings.elements.length&&clause.namedBindings.elements.every(x=>x.isTypeOnly)));
    edges.push({from:file,to:resolved??spec,kind:typeOnly?'type':ts.isExportDeclaration(n)?'reexport':'value',line:line(n),text:n.getText(sf)});
   }
  }
  if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||n.expression.getText(sf)==='require'))dynamic.push({line:line(n),expression:n.getText(sf)});
  if(ts.isVariableStatement(n)&&ts.isSourceFile(n.parent)){const exported=n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)??false;for(const d of n.declarationList.declarations)decls.push({name:d.name.getText(sf),kind:'VariableDeclaration',exported,line:line(d),end:sf.getLineAndCharacterOfPosition(d.end).line+1});}
  if(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n)||ts.isEnumDeclaration(n)){
   const name=n.name?.getText(sf)??'<anonymous>';const exported=n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)??false;
   const methods=ts.isClassDeclaration(n)?n.members.filter(m=>ts.isMethodDeclaration(m)||ts.isConstructorDeclaration(m)).map(m=>({name:m.name?.getText(sf)??'constructor',line:line(m),end:sf.getLineAndCharacterOfPosition(m.end).line+1,private:m.modifiers?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword)??false})):undefined;
   decls.push({name,kind:ts.SyntaxKind[n.kind],exported,line:line(n),end:sf.getLineAndCharacterOfPosition(n.end).line+1,...(methods?{methods}:{})});
   owner=name;
  }
  if(ts.isMethodDeclaration(n))owner=n.name.getText(sf);
  if(ts.isCallExpression(n))calls.push({file,owner,line:line(n),callee:n.expression.getText(sf)});
  ts.forEachChild(n,c=>visit(c,owner));
 }
 visit(sf);
 modules.push({file,lines:source.split('\n').length,sha256:crypto.createHash('sha256').update(source).digest('hex'),declarations:decls,dynamic});
}
function scc(typeEdges){
 const nodes=files.filter(x=>x.startsWith('src/')), adjacency=new Map(nodes.map(x=>[x,[]]));
 for(const e of edges)if(adjacency.has(e.from)&&adjacency.has(e.to)&&(typeEdges||e.kind!=='type'))adjacency.get(e.from).push(e.to);
 let i=0;const indexes=new Map(),low=new Map(),stack=[],active=new Set(),groups=[];
 function visit(v){indexes.set(v,i);low.set(v,i++);stack.push(v);active.add(v);for(const w of adjacency.get(v)){if(!indexes.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(active.has(w))low.set(v,Math.min(low.get(v),indexes.get(w)));}if(low.get(v)===indexes.get(v)){let g=[],w;do{w=stack.pop();active.delete(w);g.push(w)}while(w!==v);if(g.length>1)groups.push(g.sort());}}
 for(const v of nodes)if(!indexes.has(v))visit(v);return groups;
}
const analysis={method:'TypeScript createSourceFile AST; explicit import/export declarations only; relative .js -> .ts resolution; calls are syntax, not resolved runtime dispatch',typescript:ts.version,modules,edges,calls,sccAll:scc(true),sccValue:scc(false)};
fs.writeFileSync(out,JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({typescript:ts.version,files:files.length,sourceFiles:files.filter(x=>x.startsWith('src/')).length,edges:edges.length,sourceEdges:edges.filter(e=>e.from.startsWith('src/')&&e.to.startsWith('src/')).length,sccAll:analysis.sccAll,sccValue:analysis.sccValue,largest:modules.filter(m=>m.file.startsWith('src/')).sort((a,b)=>b.lines-a.lines).slice(0,12).map(m=>({file:m.file,lines:m.lines,imports:edges.filter(e=>e.from===m.file).length,importers:new Set(edges.filter(e=>e.to===m.file).map(e=>e.from)).size})),dynamic:modules.filter(m=>m.dynamic.length).map(m=>({file:m.file,dynamic:m.dynamic}))},null,2));
