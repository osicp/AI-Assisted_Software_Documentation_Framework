import { ASTSymbol } from './types';

export const generateClassDiagramMarkup = (symbols: ASTSymbol[]): string => {
  const classes: { [key: string]: { methods: string[]; filename: string } } = {};
  
  symbols.forEach(sym => {
    const path = sym.path || "";
    const filename = path.split('/').pop() || "Codebase";
    const scope = sym.scope;
    const name = sym.name;
    const kind = sym.kind;
    
    if (kind === 'class') {
      classes[name] = { methods: [], filename };
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
  lines.push("@enduml");
  return lines.join('\n');
};

export const generateDefaultSequenceMarkup = (classNames: string[]): string => {
  const lines = ["@startuml", "actor User"];
  if (classNames.length > 0) {
    lines.push(`User -> ${classNames[0]} : initializeCall()`);
    for (let i = 0; i < classNames.length - 1; i++) {
      lines.push(`${classNames[i]} -> ${classNames[i+1]} : delegateOperation()`);
    }
  } else {
    lines.push("User -> Controller : executeRequest()");
  }
  lines.push("@enduml");
  return lines.join('\n');
};
