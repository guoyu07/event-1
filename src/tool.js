import {TYPE_CONTINUOUS, EVENT} from './define';

export function make_flat_base(config){
  var repeat = config.repeat || 1;
  var result = [];

  if(repeat !== undefined && repeat > 1){
    for(var i = 0; i < repeat; i++){
      result.push(Object.assign({}, config));
    }
  }
  return result;
}

export function make_flat_group(config){
  if(config.group === undefined || config.group instanceof Array === false)
    return console.log('group配置有误');
  
  var result = [];

  if(config.type !== 'group')
    return make_flat_base(config);
  
  config.group.forEach(function(baseconfig){
    if(baseconfig.type === 'group')
      make_flat_group(baseconfig).forEach(function(item){
        result.push(item);
      });
    else
      make_flat_base(baseconfig).forEach(function(item){
        result.push(item);
      });
  });

  return result;
}

export function get_base_id(config){
  var type = EVENT[config.type].type;
  var opts = [
    {
      key: 'finger',
      value: config.finger
    }
  ];
  var opts_string = [];
  var after = '';

  opts.push();

  if(type === TYPE_CONTINUOUS){
    opts.push({
      key: 'startWith',
      value: config.startWith
    });
    opts.push({
      key: 'endWith',
      value: config.endWith
    });
  }

  if(config.type === 'longtap'){
    opts.push({
      key: 'longtapThreshold',
      value: config.longtapThreshold
    });
  }

  if(config.after !== undefined){
    after = get_base_id(config.after);
  }

  opts.forEach(function(opt){
    opts_string.push(`${opt.key}=${opt.value}`);
  });

  return `${config.type}[${opts_string.join(',')}]{${after}}`;
}

export function get_group_Id(config){
  var opts_string = [];

  config.group.forEach(function(baseconfig){
    opts_string.push(get_base_id(baseconfig));
  });

  return opts_string.join(',');
}

export function get_type_id(config){
  var type = config.type;
  if(type === 'longtap')
    return type+'_'+config.longtapThreshold;
  
  return type;
}

export function last_arr(num, arr){
  return arr[arr.length - num];
}
