import { ASTSymbol } from './types';

export const generateClassDiagramMarkup = (symbols: ASTSymbol[]): string => {
  const classes: { [key: string]: { methods: string[]; filename: string } } = {};
  const relationships: string[] = [];
  
  symbols.forEach(sym => {
    const path = sym.path || "";
    const filename = path.split('/').pop() || "Codebase";
    const scope = sym.scope;
    const name = sym.name;
    const kind = sym.kind;
    
    if (kind === 'class') {
      classes[name] = { methods: [], filename };
    } else if (kind === 'relationship' && scope && sym.signature) {
      relationships.push(`${scope} --> ${sym.signature}`);
    } else if (['method', 'member', 'function'].includes(kind) && scope) {
      if (!classes[scope]) {
        classes[scope] = { methods: [], filename };
      }
      const sig = sym.signature || "()";
      classes[scope].methods.push(`+${name}${sig}`);
    }
  });
  
  const lines = ["@startuml", "skinparam classAttributeIconSize 0"];
  Object.entries(classes).forEach(([cName, cData]) => {
    lines.push(`class ${cName} << ${cData.filename} >> {`);
    cData.methods.forEach(m => lines.push(`  ${m}`));
    lines.push("}");
  });
  
  if (relationships.length > 0) {
    lines.push("");
    lines.push("  ' Class relationships and dependencies:");
    relationships.forEach(rel => lines.push(`  ${rel}`));
  }
  
  lines.push("@enduml");
  return lines.join('\n');
};

export const generateDefaultSequenceMarkup = (symbols: ASTSymbol[]): string => {
  const classes: { [key: string]: string[] } = {};
  
  symbols.forEach(sym => {
    const scope = sym.scope;
    const name = sym.name;
    const kind = sym.kind;
    
    if (kind === 'class') {
      if (!classes[name]) {
        classes[name] = [];
      }
    } else if (['method', 'member', 'function'].includes(kind) && scope) {
      if (!classes[scope]) {
        classes[scope] = [];
      }
      classes[scope].push(name);
    }
  });

  const classNames = Object.keys(classes);
  const lines = ["@startuml", "actor User"];
  
  if (classNames.length > 0) {
    const firstClass = classNames[0];
    const firstMethod = classes[firstClass].length > 0 ? `${classes[firstClass][0]}()` : 'ok';
    lines.push(`User -> ${firstClass} : ${firstMethod}`);
    
    for (let i = 0; i < classNames.length - 1; i++) {
      const caller = classNames[i];
      const receiver = classNames[i+1];
      const receiverMethod = classes[receiver].length > 0 ? `${classes[receiver][0]}()` : 'ok';
      lines.push(`${caller} -> ${receiver} : ${receiverMethod}`);
    }
  } else {
    lines.push("User -> Controller : ok");
  }
  lines.push("@enduml");
  return lines.join('\n');
};
