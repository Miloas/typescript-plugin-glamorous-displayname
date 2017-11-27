import * as ts from 'typescript'

export interface Options {
  getDisplayName(filename: string, bindingName: string | undefined): string | undefined
}

function defaultGetDisplayName(_filename: string, bindingName: string | undefined): string | undefined {
  return bindingName
}

// import g from 'glamorous' -> glamorous
function getImportedLibName(node: ts.Node): string | void {
  return (node as ts.ImportDeclaration).moduleSpecifier.getText().replace(/"/g, '\'')
}

// import g from 'glamorous' -> g
function getAliasGlamorousName(node: ts.Node): string | void {
  if (getImportedLibName(node) === '\'glamorous\'') {
    return (node as ts.ImportDeclaration).importClause!.name!.escapedText as string
  }
}

// const MyButton = g.button() -> MyButton
function getGlamorousDisplayName(node: ts.Node, aliasGlamorousLibName: string): string {
  const callExp = node as ts.CallExpression
  const propertyAccessExp = callExp.expression as ts.PropertyAccessExpression
  const varName = propertyAccessExp.expression as ts.Identifier
  const displayName = node.parent!.getChildAt(0).getText()
  return varName.escapedText === aliasGlamorousLibName ? displayName : ''
}

// idName.propertyName.withConfig({
//   displayName: displayName
// })()
function createWithConfNodeByParams(idName: string, propertyName: string, displayName: string): ts.Node {
  return ts.createCall(
    ts.createPropertyAccess(
      ts.createPropertyAccess(
        ts.createIdentifier(idName),
        propertyName
      ),
      'withConfig'
    ),
    undefined,
    [ts.createObjectLiteral([ts.createPropertyAssignment('displayName', ts.createLiteral(displayName))])]
  )
}

function createWithConfNodeByNode(node: ts.Node, getDisplayName: typeof defaultGetDisplayName, aliasGlamorousLibName: string): ts.Node {
  const displayName = getDisplayName(node.getSourceFile().fileName, getGlamorousDisplayName(node.parent!, aliasGlamorousLibName))
  const propertyName = (node as ts.PropertyAccessExpression).name.getText()
  const idName = node.getChildAt(0).getText()
  if (idName !== aliasGlamorousLibName) {
    return node
  }
  return createWithConfNodeByParams(idName, propertyName!, displayName!)
}

// idName(MyThing, {rootEl: 'div'}).withConfig({
//   displayName: displayName
// })()
function createWithConfNodeByNode2(node: ts.Node, getDisplayName: typeof defaultGetDisplayName, aliasGlamorousLibName: string): ts.Node {
  const displayName = getDisplayName(node.getSourceFile().fileName, getGlamorousDisplayName(node.parent!, aliasGlamorousLibName))
  const idName = node.getChildAt(0).getText()
  if (idName !== aliasGlamorousLibName) {
    return node
  }
  return ts.createCall(
    ts.createPropertyAccess(
      node as ts.Expression,
      'withConfig'
    ),
    undefined,
    [ts.createObjectLiteral([ts.createPropertyAssignment('displayName', ts.createLiteral(displayName!))])]
  )
}

function isPropAccess(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.PropertyAccessExpression
}

function isCallExp(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.CallExpression
}

// parent is CallExpression
// parent.parent is VariableDeclaration
function isChildOfCallExpInVarDecl(node: ts.Node): boolean {
  if (node.parent
    && node.parent.parent
    && node.parent.kind === ts.SyntaxKind.CallExpression
    // const comp = {}
    // comp.div = g(MyThing, {rootEl: 'div'})()
    && (
        node.parent.parent.kind === ts.SyntaxKind.VariableDeclaration
      || node.parent.parent.kind === ts.SyntaxKind.BinaryExpression
    )
  ) {
    return true
  }
  return false
}

function isChildOfCallExpInPropAssign(node: ts.Node): boolean {
  if (node.parent
    && node.parent.parent
    && node.parent.kind === ts.SyntaxKind.CallExpression
    && node.parent.parent.kind === ts.SyntaxKind.PropertyAssignment
  ) {
    return true
  }
  return false
}

export function createTransformer(options?: Partial<Options>): ts.TransformerFactory<ts.SourceFile>
export function createTransformer({ getDisplayName = defaultGetDisplayName }: Partial<Options> = {}) {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    let aliasGlamorousLibName: string | void
    const visitor: ts.Visitor = (node) => {

      ts.forEachChild(node, n => {
        if (!n.parent) {
          n.parent = node
        }
      })

      if (node.kind === ts.SyntaxKind.SourceFile) {
        return ts.visitEachChild(node, visitor, context)
      }

      if (node.kind === ts.SyntaxKind.ImportDeclaration && !aliasGlamorousLibName) {
        aliasGlamorousLibName = getAliasGlamorousName(node)
      }

      if (!aliasGlamorousLibName) {
        return node
      }

      // const MyButton = g.button()
      if (isPropAccess(node) && isChildOfCallExpInVarDecl(node)) {
        return createWithConfNodeByNode(node, getDisplayName, aliasGlamorousLibName)
      }

      // const MyComp = g(MyThing, {rootEl: 'div'})()
      if (isCallExp(node) && isChildOfCallExpInVarDecl(node)) {
       return createWithConfNodeByNode2(node, getDisplayName, aliasGlamorousLibName)
      }

      // { x: g.button() }
      if (isPropAccess(node) && isChildOfCallExpInPropAssign(node)) {
        return createWithConfNodeByNode(node, getDisplayName, aliasGlamorousLibName)
      }

      // { x: g(MyThing, {rootEl: 'div'})() }
      if (isCallExp(node) && isChildOfCallExpInPropAssign(node)) {
        return createWithConfNodeByNode2(node, getDisplayName, aliasGlamorousLibName)
      }

      return ts.visitEachChild(node, visitor, context)
    }
    return (node) => ts.visitNode(node, visitor)
  }
  return transformer
}

export default createTransformer
