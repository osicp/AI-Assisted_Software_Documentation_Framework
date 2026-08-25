import { ASTSymbol } from './types';

export const sanitizeIdentifier = (name: string): string => {
  if (!name) return "Unknown";
  // Replace spaces, slashes, backslashes, hyphens, and plus signs with underscores
  let clean = name.trim().replace(/[\s/\\+\-]/g, '_');
  // Remove any remaining characters that are not alphanumeric or underscore
  clean = clean.replace(/[^\w]/g, '');
  // If it starts with a number, prepend "Class_"
  if (/^[0-9]/.test(clean)) {
    clean = "Class_" + clean;
  }
  // If it is empty or just underscores, return a fallback
  if (!clean || /^_+$/.test(clean)) {
    return "RootClass";
  }
  return clean;
};

export const generateClassDiagramMarkup = (symbols: ASTSymbol[]): string => {
  // Only symbols ctags actually tagged kind === 'class' count as real classes. A method/member/
  // function's `scope` is just whatever ctags recorded as its enclosing block — for a plain JS/TS
  // object literal (e.g. a tailwind.config.js theme object), that's a nested object key like
  // "extend" or "theme", never confirmed as a class. Without this check, every such scope became
  // a fabricated phantom "class" purely from config-file structure.
  const classNames = new Set<string>();
  symbols.forEach(sym => {
    if (sym.kind === 'class') {
      classNames.add(sanitizeIdentifier(sym.name));
    }
  });

  const classes: { [key: string]: { methods: string[]; filename: string } } = {};
  const relationships: string[] = [];

  symbols.forEach(sym => {
    const path = sym.path || "";
    const filename = path.split('/').pop() || "Codebase";
    const scope = sym.scope ? sanitizeIdentifier(sym.scope) : undefined;
    const name = sym.name;
    const kind = sym.kind;

    if (kind === 'class') {
      const cleanClassName = sanitizeIdentifier(name);
      classes[cleanClassName] = { methods: [], filename };
    } else if (kind === 'relationship' && scope && sym.signature) {
      relationships.push(`${scope} --> ${sanitizeIdentifier(sym.signature)}`);
    } else if (['method', 'member', 'function'].includes(kind) && scope && classNames.has(scope)) {
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
  // Same fix as generateClassDiagramMarkup above: a scope only becomes a sequence-diagram
  // participant if it was actually confirmed as a class, not just because some symbol happened
  // to record it as an enclosing scope (e.g. a config object's nested keys).
  const classNames = new Set<string>();
  symbols.forEach(sym => {
    if (sym.kind === 'class') {
      classNames.add(sanitizeIdentifier(sym.name));
    }
  });

  const classes: { [key: string]: string[] } = {};
  classNames.forEach(name => {
    classes[name] = [];
  });

  symbols.forEach(sym => {
    const scope = sym.scope ? sanitizeIdentifier(sym.scope) : undefined;
    const name = sym.name;
    const kind = sym.kind;

    if (['method', 'member', 'function'].includes(kind) && scope && classNames.has(scope)) {
      classes[scope].push(name);
    }
  });

  const orderedClassNames = Object.keys(classes);
  const lines = ["@startuml", "actor User"];

  if (orderedClassNames.length > 0) {
    const firstClass = orderedClassNames[0];
    const firstMethod = classes[firstClass].length > 0 ? `${classes[firstClass][0]}()` : 'ok';
    lines.push(`User -> ${firstClass} : ${firstMethod}`);

    for (let i = 0; i < orderedClassNames.length - 1; i++) {
      const caller = orderedClassNames[i];
      const receiver = orderedClassNames[i+1];
      const receiverMethod = classes[receiver].length > 0 ? `${classes[receiver][0]}()` : 'ok';
      lines.push(`${caller} -> ${receiver} : ${receiverMethod}`);
    }
  } else {
    lines.push("User -> Controller : ok");
  }
  lines.push("@enduml");
  return lines.join('\n');
};
