// One household, one key: an IPv6 subscriber owns a whole /64, so the limits
// count its network rather than each of its 2^64 addresses.
export function networkOf(ip){
  if(typeof ip!=='string'||!ip.includes(':'))return ip||null;
  const [head,tail=null]=ip.toLowerCase().split('::');
  const left=head?head.split(':'):[],right=tail?tail.split(':'):[];
  const groups=tail===null?left:[...left,...Array(Math.max(0,8-left.length-right.length)).fill('0'),...right];
  return groups.slice(0,4).map(group=>group.replace(/^0+(?=.)/,'')).join(':')+'::/64';
}
