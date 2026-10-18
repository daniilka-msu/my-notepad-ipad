const MathExpression = (() => {
  const functions={sin:[1,Math.sin],cos:[1,Math.cos],tan:[1,Math.tan],asin:[1,Math.asin],acos:[1,Math.acos],atan:[1,Math.atan],sqrt:[1,Math.sqrt],abs:[1,Math.abs],ln:[1,Math.log],log:[1,Math.log10],exp:[1,Math.exp],min:[2,Math.min],max:[2,Math.max]};
  function compile(source){
    if(typeof source!=='string'||!source.trim()||source.length>200)throw new Error('Введите выражение до 200 символов');
    let offset=0,token=null,count=0,depth=0;
    function next(){while(/\s/.test(source[offset]||'')&&offset<source.length)offset++;if(offset===source.length){token={type:'end'};return}const rest=source.slice(offset),number=rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i),name=rest.match(/^[a-z]+/i);if(number){offset+=number[0].length;token={type:'number',value:Number(number[0])};if(!Number.isFinite(token.value))throw new Error('Слишком большое число')}else if(name){offset+=name[0].length;token={type:'name',value:name[0].toLowerCase()}}else if('+-*/^(),'.includes(rest[0])){offset++;token={type:rest[0]}}else throw new Error('Недопустимый символ в выражении')}
    function node(value){if(++count>150)throw new Error('Слишком сложное выражение');return value}
    function take(type){if(token.type!==type)throw new Error('Ожидается «'+type+'»');next()}
    function primary(){if(++depth>40)throw new Error('Слишком глубокая вложенность');let result;
      if(token.type==='number'){result=node({value:token.value});next()}
      else if(token.type==='('){next();result=sum();take(')')}
      else if(token.type==='name'){const name=token.value;next();if(name==='x')result=node({name});else if(name==='pi'||name==='e')result=node({value:name==='pi'?Math.PI:Math.E});else{const fn=Object.hasOwn(functions,name)?functions[name]:null;if(!fn)throw new Error('Неизвестное имя: '+name);take('(');const args=[sum()];while(token.type===','){next();args.push(sum())}take(')');if(args.length!==fn[0])throw new Error('Неверное число аргументов: '+name);result=node({fn:fn[1],args})}}
      else throw new Error('Ожидается число, x или функция');depth--;return result;
    }
    function power(){let left=primary();if(token.type==='^'){next();left=node({op:'^',left,right:unary()})}return left}
    function unary(){if(token.type==='+'||token.type==='-'){if(++depth>40)throw new Error('Слишком глубокая вложенность');const negative=token.type==='-';next();const right=unary();depth--;return negative?node({op:'negate',right}):right}return power()}
    function product(){let left=unary();while(token.type==='*'||token.type==='/'){const op=token.type;next();left=node({op,left,right:unary()})}return left}
    function sum(){let left=product();while(token.type==='+'||token.type==='-'){const op=token.type;next();left=node({op,left,right:product()})}return left}
    next();const ast=sum();if(token.type!=='end')throw new Error('Лишние символы; используйте * для умножения');
    function evaluate(n,x){if(n.value!==undefined)return n.value;if(n.name)return x;if(n.fn)return n.fn(...n.args.map(a=>evaluate(a,x)));const b=evaluate(n.right,x);if(n.op==='negate')return -b;const a=evaluate(n.left,x);return n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:n.op==='/'?a/b:a**b}
    return x=>{const y=evaluate(ast,x);return Number.isFinite(y)?y:NaN};
  }
  return {compile};
})();
